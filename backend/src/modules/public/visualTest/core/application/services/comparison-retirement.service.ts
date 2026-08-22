import { Inject, Injectable } from '@nestjs/common';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { JOB_PRODUCER, IJobProducer } from '@common/domain/job-queue.interface';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { TransactionContext } from '@/prisma/transaction-context';
import type { CreatePendingComparisonParams } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';

// Single owner of the "at most one reviewable comparison per Variant"
// invariant. Every variant-scoped + threshold retirement flows through here so
// the comparison deletion, candidate reclamation, and job cancellation side
// effects stay in one place instead of being re-orchestrated per caller.
//
// This is the TRANSACTION-RIDING half of the retirement seam: every recipe
// WRITES through the ambient ALS-routed repositories and MUST be called from
// inside a StateChangeWorkflow change callback. Outside one, the writes ride
// the bare connection and the atomicity of "retire + write + enqueue" silently
// disappears (the same trap documented on IJobProducer). The contract is
// enforced, not documented: each recipe calls assertInTransaction() before
// writing, so escaping the workflow is a loud error, not a silent one.
//
// The transaction-OWNING half (single-candidate worker reclamation) lives in
// CandidateReclamationService, which owns its own StateChangeWorkflow
// transaction (plus the recompute + post-commit cleanup) so moot worker jobs
// and unchanged diffs cross that seam without hand-rolling executeStateChange.
@Injectable()
export class ComparisonRetirementService {
  constructor(
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
    @Inject(JOB_PRODUCER) private readonly jobQueue: IJobProducer,
    private readonly txCtx: TransactionContext,
  ) {}

  private assertInTransaction(): void {
    this.txCtx.assertInTransaction();
  }

  // Upload path: a new upload supersedes the pending change for the variant.
  // Retires every pending comparison (nothing to keep) and cancels queued diff
  // jobs eagerly — the new job is enqueued after this call, so it is safe.
  // Transaction-riding: call inside a StateChangeWorkflow change.
  async supersedeForVariant(
    testId: string,
    variant: Variant,
  ): Promise<string[]> {
    this.assertInTransaction();
    return this.retireVariant(testId, variant, { cancelJobs: true });
  }

  // One recipe for the identical upload's retirement: supersede the variant's
  // pending comparisons (cancel queued jobs) AND reclaim the CURRENT candidate
  // row. Both effects are one logical operation — an identical upload makes
  // the variant's change moot — expressed through the single option matrix
  // instead of a bolted-on second retirement hop.
  // Transaction-riding: call inside a StateChangeWorkflow change.
  async supersedeIdenticalForVariant(
    testId: string,
    variant: Variant,
  ): Promise<string[]> {
    this.assertInTransaction();
    return this.retireVariant(testId, variant, {
      cancelJobs: true,
      reclaimCurrentCandidate: true,
    });
  }

  // Approval path: retire sibling pending comparisons, delete the approved
  // candidate row, and cancel queued jobs. Approval replaces the baseline, so
  // any still-queued diff for the variant would compute against a stale
  // baseline — cancelling is safe. No keep is needed: the approved comparison
  // is already gone (image) or APPROVED (PDF), so it never matches the
  // PENDING_APPROVAL retirement filter regardless.
  // Transaction-riding: call inside a StateChangeWorkflow change.
  async retireSiblingsAndDeleteCandidate(
    testId: string,
    variant: Variant,
    candidateId: string,
  ): Promise<string[]> {
    this.assertInTransaction();
    return this.retireVariant(testId, variant, {
      cancelJobs: true,
      reclaimCandidateIds: [candidateId],
    });
  }

  // Worker path: persist a fresh pending comparison and retire its siblings
  // (keeping the new one). Deliberately does NOT cancel queued jobs — a job
  // belonging to a newer candidate must still run so the latest upload gets
  // compared.
  // Transaction-riding: call inside a StateChangeWorkflow change.
  async createPendingForVariant(
    params: CreatePendingComparisonParams & {
      variant: Variant;
    },
  ): Promise<{ id: string; staleUrls: string[] }> {
    this.assertInTransaction();
    const { variant, ...createParams } = params;
    const { id } = await this.comparisons.createPending(createParams);
    const staleUrls = await this.retireVariant(params.testId, variant, {
      keepComparisonId: id,
    });
    return { id, staleUrls };
  }

  // Variant-teardown path: delete the comparisons referencing these screenshot
  // rows (any status), cancel the pending jobs for their candidates, and reclaim
  // the candidate rows through the single guarded owner. Same lifecycle as
  // retireVariant scoped by screenshot ids instead of a variant — "a comparison
  // dies" has one home regardless of the scoping. Returns the candidate ids so
  // the caller can skip re-deleting rows the cascade already reclaimed.
  // Transaction-riding: call inside a StateChangeWorkflow change.
  async retireComparisonsForScreenshots(
    testId: string,
    screenshotIds: string[],
  ): Promise<{ staleUrls: string[]; candidateIds: string[] }> {
    this.assertInTransaction();
    const deleted = await this.comparisons.deleteComparisonsForScreenshots(
      testId,
      screenshotIds,
    );
    await this.jobQueue.cancelPendingByCandidateIds(screenshotIds);
    const candidateUrls = await this.reclaimCandidates(deleted.candidateIds);
    return {
      staleUrls: [...candidateUrls, ...deleted.staleDiffUrls],
      candidateIds: deleted.candidateIds,
    };
  }

  // Threshold path: auto-accept deletes the specific pending comparisons whose
  // mismatch fell at or below the new threshold, cancels any queued jobs for
  // their candidates (before reclaiming the rows, matching retireVariant's
  // order), then reclaims the candidate rows so a stale diff never runs against
  // a retired row.
  // Transaction-riding: call inside a StateChangeWorkflow change.
  async retirePendingComparisons(
    testId: string,
    ids: string[],
  ): Promise<string[]> {
    this.assertInTransaction();
    const deleted = await this.comparisons.deletePendingByIds(testId, ids);
    await this.jobQueue.cancelPendingByCandidateIds(deleted.candidateIds);
    const candidateUrls = await this.reclaimCandidates(deleted.candidateIds);
    return [...candidateUrls, ...deleted.staleDiffUrls];
  }

  // Candidate rows are reclaimed through the single guarded owner so a row a
  // comparison still references is never deleted.
  private async reclaimCandidates(candidateIds: string[]): Promise<string[]> {
    if (candidateIds.length === 0) return [];
    return this.screenshots.deleteCandidatesAndCollectUrls(candidateIds);
  }

  // One parameterized retirement flow behind the variant-scoped recipes: retires
  // the pending comparisons, optionally cancels their queued jobs and reclaims
  // the candidate rows (the retired comparisons' candidates, any explicitly
  // named, and — for the identical path — the CURRENT candidate row, whose
  // deletion makes a PROCESSING diff job's supersede-detector fail so it retires
  // its moot candidate instead of committing a stale comparison). Keeping the
  // option matrix here means a change to how jobs are cancelled or candidates
  // are reclaimed has one home, not three.
  private async retireVariant(
    testId: string,
    variant: Variant,
    options: {
      keepComparisonId?: string;
      cancelJobs?: boolean;
      reclaimCandidateIds?: string[];
      reclaimCurrentCandidate?: boolean;
    },
  ): Promise<string[]> {
    const retired = await this.comparisons.retirePendingForVariant(
      testId,
      variant,
      ...(options.keepComparisonId ? [options.keepComparisonId] : []),
    );
    const staleUrls = [...retired.staleDiffUrls];
    if (options.cancelJobs) {
      await this.jobQueue.cancelPendingForVariant(testId, variant.toRecord());
    }
    const candidateIds = [
      ...retired.candidateIds,
      ...(options.reclaimCandidateIds ?? []),
    ];
    if (options.reclaimCurrentCandidate) {
      const current = await this.screenshots.findCurrentByVariant(
        testId,
        variant,
      );
      if (current) candidateIds.push(current.id);
    }
    if (candidateIds.length > 0) {
      const candidateUrls = await this.reclaimCandidates(candidateIds);
      return [...candidateUrls, ...staleUrls];
    }
    return staleUrls;
  }
}
