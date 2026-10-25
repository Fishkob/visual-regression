import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { context, propagation } from '@opentelemetry/api';
import { Tracker } from '@common/tracker/tracker.service';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  COMPARISON_ENGINES,
  ComparisonEngines,
  IComparisonEngine,
  mismatchCount,
  ComparisonResult,
} from '@common/domain/comparison-engine.interface';
import type { TestKind } from '@common/domain/test-kind';
import { DomainError } from '@common/domain/domain-error';
import { SupersededDiffError } from '@public/visualTest/intake/workers/superseded-diff.error';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { CandidateReclamationService } from '@public/visualTest/core/application/services/candidate-reclamation.service';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { isThresholdExceeded } from '@public/visualTest/core/domain/policies/threshold-policy';
import type { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { change } from '@public/visualTest/core/application/services/state-change-options';
import {
  KIND_MIME_TYPES,
  KIND_FILE_EXTENSIONS,
} from '@common/domain/test-kind';
import type { QueuedJob } from '@common/domain/job-queue.interface';
import type { JobData } from '@common/domain/job-data.types';
import { TRACKED_OPERATIONS } from '@common/domain/metrics-catalog';

// One class owns the full comparison job lifecycle: the mootness gate, the
// downloads, the engine dispatch, and the persist-or-retire outcome. The
// supersession rule (candidate replaced by a newer upload, or baseline replaced
// by an approval) is checked before the expensive work and re-checked
// in-transaction so a job that becomes moot mid-compare cannot resurrect a
// comparison against stale content.
@Injectable()
export class ComparisonJobProcessor {
  constructor(
    private readonly tracker: Tracker,
    private readonly workflow: StateChangeWorkflow,
    private readonly retirement: ComparisonRetirementService,
    private readonly reclamation: CandidateReclamationService,
    private readonly screenshots: UnifiedScreenshotRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @Inject(COMPARISON_ENGINES) private readonly engines: ComparisonEngines,
  ) {}

  async processJob(job: QueuedJob): Promise<void> {
    const { traceContext } = job.payload;

    if (traceContext && Object.keys(traceContext).length > 0) {
      const extractedCtx = propagation.extract(context.active(), traceContext);
      return context.with(extractedCtx, () => this.doProcess(job));
    }

    return this.doProcess(job);
  }

  private async doProcess(job: QueuedJob): Promise<void> {
    await this.tracker.track(TRACKED_OPERATIONS.comparisonWorker, async () => {
      await this.processWithEngine(job.payload);
    });
  }

  private getEngine(kind: string): IComparisonEngine {
    const engine = this.engines[kind as TestKind];
    if (!engine) {
      throw new DomainError(
        `No comparison engine for kind: ${kind}`,
        'INVALID_STATE',
      );
    }
    return engine;
  }

  private async processWithEngine(data: JobData): Promise<void> {
    try {
      // Gate before the expensive work: a superseded job (candidate replaced by
      // a newer upload, or baseline replaced by an approval) is retired without
      // paying for the candidate download, the baseline download, the
      // comparison, or the diff artifact upload. The returned baseline carries
      // the threshold the auto-accept rule needs; reading it here means a
      // threshold raised while the job is queued is honoured.
      const { baseline } = await this.loadCurrentCandidateOrFail(data);

      const candidateBuffer = await this.getCandidateOrHandleMissing(data);
      if (candidateBuffer === null) return;

      const baselineBuffer = await this.getBaselineOrDetectSupersession(data);

      const engine = this.getEngine(data.testKind);
      const result = await engine.compare(baselineBuffer, candidateBuffer);
      const mismatch = mismatchCount(result);
      if (mismatch === 0) {
        await this.handleUnchanged(data);
      } else if (this.isWithinThreshold(data.testKind, mismatch, baseline)) {
        await this.handleWithinThreshold(data, mismatch);
      } else {
        await this.handleDiff(data, result);
      }
    } catch (err) {
      if (err instanceof SupersededDiffError) {
        await this.retireMootCandidate(data);
        return;
      }
      throw err;
    }
  }

  // Threshold is an image-only concept, and a missing value (legacy rows or a
  // partial test double) means "no tolerance" — the same 0 default the schema
  // uses, so the comparison stays a reviewable diff.
  private isWithinThreshold(
    testKind: TestKind,
    mismatch: number,
    baseline: ScreenshotEntity,
  ): boolean {
    return (
      testKind === 'image' &&
      !isThresholdExceeded(mismatch, baseline.pixelDiffThreshold ?? 0)
    );
  }

  // A missing candidate object means the diff is moot (the candidate was
  // retired by a newer upload or approval) — retire it through the single
  // owner and complete silently. Returns null to abort processing. The
  // payload's candidate URL guards against reclaiming a row that a newer
  // upload has since re-used in place.
  private async getCandidateOrHandleMissing(
    data: JobData,
  ): Promise<Buffer | null> {
    try {
      return await this.storage.get(data.candidate.url);
    } catch (err) {
      if (err instanceof DomainError && err.code === 'NOT_FOUND') {
        await this.retireMootCandidate(data);
        return null;
      }
      throw err;
    }
  }

  // A missing baseline object can mean either: (a) a concurrent approval
  // replaced the baseline row and its post-commit cleanup deleted the old
  // object between the gate above and this download — the job is moot; or
  // (b) the object is genuinely gone while the row is still current — a
  // candidate-lifecycle-neutral event that must surface to the DLQ rather than
  // destroy a still-live candidate. Re-running the gate disambiguates: if the
  // baseline row no longer matches the payload, treat it as superseded; only a
  // row that still points at the missing object lets the NOT_FOUND propagate.
  private async getBaselineOrDetectSupersession(
    data: JobData,
  ): Promise<Buffer> {
    try {
      return await this.storage.get(data.baseline.url);
    } catch (err) {
      if (err instanceof DomainError && err.code === 'NOT_FOUND') {
        await this.loadCurrentCandidateOrFail(data);
      }
      throw err;
    }
  }

  // A candidate whose diff is moot is retired through the same retirement seam
  // as every other reclamation, delegating to the guarded candidate owner so
  // row deletion + batched storage deletion share one transaction and failure
  // story. The transaction lives inside reclaimCandidateInChange (owned by
  // CandidateReclamationService). When the reclamation deletes nothing (the row
  // was already reclaimed — e.g. a concurrent test deletion, which only cancels
  // PENDING jobs), the recipe reports a `noop` so the recompute never hits a
  // P2025 on a gone test.
  private async retireMootCandidate(data: JobData): Promise<void> {
    await this.reclamation.reclaimCandidateInChange({
      testId: data.testId,
      candidateId: data.candidate.id,
      expectedUrl: data.candidate.url,
    });
  }

  // The candidate-hash half of the supersession rule: the job is moot if the
  // CURRENT candidate row no longer holds the payload's hash (a newer upload
  // re-used the row in place). Returns the row so the diff paths can persist
  // against it; throws SupersededDiffError when moot.
  private async loadCurrentCandidateByHash(
    data: JobData,
  ): Promise<{ id: string; imageHash: string }> {
    const current = await this.screenshots.findCurrentByVariant(
      data.testId,
      Variant.fromRecord(data.variant),
    );
    if (current?.imageHash !== data.candidateHash) {
      throw new SupersededDiffError('Comparison superseded by a newer upload');
    }
    return current;
  }

  // The diff was computed against the baseline frozen in the payload. If a
  // concurrent approval replaced that baseline, persisting a comparison against
  // the stale id would let it escape retirement — abort as superseded so the
  // processor retires the orphaned candidate instead. Approval updates the
  // baseline row in place (same id, new file URL), so the row's current URL is
  // compared, not just the id, to detect an in-place replacement. Returns the
  // row so the caller can read the current threshold from the same check.
  private async assertBaselineStillCurrent(
    data: JobData,
  ): Promise<ScreenshotEntity> {
    const baseline = await this.screenshots.findBaselineByVariant(
      data.testId,
      Variant.fromRecord(data.variant),
    );
    if (!baseline?.id || baseline.id !== data.baseline.id) {
      throw new SupersededDiffError(
        'Baseline replaced by a newer approval or upload',
      );
    }
    if (baseline.imageUrl !== data.baseline.url) {
      throw new SupersededDiffError(
        'Baseline replaced by a newer approval or upload',
      );
    }
    return baseline;
  }

  // The supersession rule, single-sourced for every call site: asserts the
  // candidate row still holds the payload's hash AND the baseline row/id/url
  // still match the payload, and returns the current candidate row plus the
  // baseline it was checked against. A job that fails either check is moot —
  // the processor retires its candidate instead of committing a stale
  // comparison. This is also the cheap pre-compare gate for the worker: a job
  // that is already moot is retired before the expensive comparison + diff
  // upload run. The in-transaction calls inside handleUnchanged/handleDiff stay
  // as the race-closer for a job that becomes moot mid-compare.
  private async loadCurrentCandidateOrFail(data: JobData): Promise<{
    id: string;
    imageHash: string;
    baseline: ScreenshotEntity;
  }> {
    const current = await this.loadCurrentCandidateByHash(data);
    const baseline = await this.assertBaselineStillCurrent(data);
    return { ...current, baseline };
  }

  private async handleUnchanged(data: JobData): Promise<void> {
    await this.reclamation.reclaimCandidateInChange({
      testId: data.testId,
      events: [
        {
          kind: 'comparison_completed',
          testKind: data.testKind,
          visualTestId: data.testId,
          comparisonId: undefined,
          outcome: 'unchanged',
          diffMetric: 0,
        },
      ],
      resolveCandidate: async () => this.loadCurrentCandidateOrFail(data),
    });
  }

  // An image diff at or below the baseline threshold is accepted without a
  // review. The baseline is deliberately kept (no silent promotion): every
  // future run is measured against the same reference, so tolerated
  // differences cannot accumulate, and approval stays the only path that
  // writes a baseline. No comparison row and no diff artifact are stored — the
  // candidate is reclaimed exactly like an unchanged diff, through the same
  // in-transaction race-closer.
  private async handleWithinThreshold(
    data: JobData,
    mismatch: number,
  ): Promise<void> {
    await this.reclamation.reclaimCandidateInChange({
      testId: data.testId,
      events: [
        {
          kind: 'comparison_completed',
          testKind: data.testKind,
          visualTestId: data.testId,
          comparisonId: undefined,
          outcome: 'within_threshold',
          diffMetric: mismatch,
        },
      ],
      resolveCandidate: async () => this.loadCurrentCandidateOrFail(data),
    });
  }

  private async handleDiff(
    data: JobData,
    result: ComparisonResult,
  ): Promise<void> {
    // Per-attempt unique artifact name: a stall-reclaimed job re-runs with the
    // same payload, so the diff object name must not be frozen in the payload.
    // A fresh name per attempt means a re-run writes a new object instead of
    // overwriting the artifact its sibling comparison references.
    const diffName = this.diffName(data);
    await this.workflow.executeWithStoredFile({
      store: () =>
        this.storage.putObject(
          diffName,
          result.diffOutput,
          this.diffMimeType(data),
        ),
      change: async (diffUrl) => {
        const current = await this.loadCurrentCandidateOrFail(data);
        const persisted = await this.persistDiff(
          data,
          result,
          diffUrl,
          current.id,
        );
        return change([data.testId], {
          staleUrls: persisted.staleDiffUrls,
          events: [
            {
              kind: 'comparison_completed',
              testKind: data.testKind,
              visualTestId: data.testId,
              comparisonId: persisted.comparisonId,
              outcome: 'changed',
              diffMetric: mismatchCount(result),
            },
          ],
        });
      },
    });
  }

  private diffMimeType(data: JobData): string {
    return KIND_MIME_TYPES[data.testKind];
  }

  private diffName(data: JobData): string {
    return `${data.candidateHash}-${randomUUID()}.diff.${KIND_FILE_EXTENSIONS[data.testKind]}`;
  }

  // The engine's typed result is the authority on what a comparison row
  // carries — the row's column mapping lives beside the row itself (the
  // comparisons seam, createPending), so this is a pass-through: no per-kind
  // switch here to keep in sync with the repository.
  private async persistDiff(
    data: JobData,
    result: ComparisonResult,
    diffUrl: string,
    candidateId: string,
  ): Promise<{ comparisonId: string; staleDiffUrls: string[] }> {
    const created = await this.retirement.createPendingForVariant({
      testId: data.testId,
      variant: Variant.fromRecord(data.variant),
      baselineId: data.baseline.id,
      candidateId,
      diffUrl,
      result,
    });
    return { comparisonId: created.id, staleDiffUrls: created.staleUrls };
  }
}
