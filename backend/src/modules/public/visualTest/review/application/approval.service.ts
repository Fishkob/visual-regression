import { Injectable, Inject } from '@nestjs/common';
import { Tracker } from '@common/tracker/tracker.service';
import { DomainError } from '@common/domain/domain-error';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { change } from '@public/visualTest/core/application/services/state-change-options';
import type { TestKind } from '@common/domain/test-kind';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import {
  ApprovalDecision,
  ComparisonEntity,
} from '@public/visualTest/core/domain/entities/comparison.entity';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import {
  ApprovalAuditRepository,
  type ApprovalAuditRecord,
} from '@public/visualTest/core/infrastructure/repositories/approval-audit.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { BaselineHistoryService } from '@public/visualTest/core/application/services/baseline-history.service';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import {
  PDF_RENDER_CACHE,
  IPdfRenderCache,
} from '@common/domain/pdf-sidecar.interface';
import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { TRACKED_OPERATIONS } from '@common/domain/metrics-catalog';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';

@Injectable()
export class ApprovalService {
  // The per-kind variance for approval: what the baseline write carries, how
  // the comparison row completes, and the post-commit cleanup. Everything else —
  // the recipe in persist(), the retirement, the URL reclamation — is
  // kind-agnostic and lives in the service. The image kind deletes its
  // comparison row; the PDF kind keeps the APPROVED row as history but clears
  // the diff pdf reference. A third kind would add one config entry, not more
  // edits in the shared recipe. Arrow functions capture the service's injected
  // collaborators, so the config stays data-shaped at the call sites.
  private readonly kindConfigs: Record<TestKind, ApprovalKindConfig> = {
    image: {
      baselineUpdateData: (decision) => ({
        imageHash: decision.newBaseline.imageHash,
        imageUrl: decision.newBaseline.imageUrl,
      }),
      // Image approval completes the comparison by deleting it (the approved
      // change is folded into the baseline; history is not kept). The
      // reclaimable diff artifact is the diff image. No post-commit hook.
      completeComparison: (decision) =>
        this.comparisons.completeImageApproval(
          decision.visualTestId,
          decision.comparisonId,
        ),
    },
    pdf: {
      // PDF persists the candidate's page count alongside the new file.
      baselineUpdateData: (decision) => ({
        imageHash: decision.newBaseline.imageHash,
        imageUrl: decision.newBaseline.imageUrl,
        pageCount: decision.newBaseline.pageCount,
      }),
      // PDF approval keeps the APPROVED comparison row as history but clears
      // the diff pdf reference (the artifact is reclaimed post-commit).
      completeComparison: (decision) =>
        this.comparisons.completePdfApproval(
          decision.comparisonId,
          decision.diffPdfUrl,
        ),
      // Post-commit hook: evict the render caches for the previous baseline and
      // the diff pdf, whose source objects are being reclaimed.
      cleanupAfterCommit: async (decision) => {
        if (decision.previousBaselineUrl) {
          await this.pdfRenderCache.clearCache(decision.previousBaselineUrl);
        }
        if (decision.diffPdfUrl) {
          await this.pdfRenderCache.clearCache(decision.diffPdfUrl);
        }
      },
    },
  };

  constructor(
    private readonly tracker: Tracker,
    private readonly workflow: StateChangeWorkflow,
    private readonly testResolver: TestResolver,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly retirement: ComparisonRetirementService,
    private readonly baselineHistory: BaselineHistoryService,
    private readonly webhooks: WebhookDispatchService,
    private readonly audit: AuditService,
    @Inject(PDF_RENDER_CACHE)
    private readonly pdfRenderCache: IPdfRenderCache,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly approvalAudit: ApprovalAuditRepository,
  ) {}

  async approveImage(
    projectName: string,
    testName: string,
    comparisonId: string,
    approvedBy: string,
    branchName?: string,
  ): Promise<{
    approved: true;
    newBaselineUrl: string;
    signedNewBaselineUrl: string;
  }> {
    return this.executeApproval(
      'image',
      projectName,
      testName,
      comparisonId,
      approvedBy,
      branchName,
    );
  }

  async approvePdf(
    projectName: string,
    testName: string,
    comparisonId: string,
    approvedBy: string,
    branchName?: string,
  ): Promise<{
    approved: true;
    newBaselineUrl: string;
    signedNewBaselineUrl: string;
  }> {
    return this.executeApproval(
      'pdf',
      projectName,
      testName,
      comparisonId,
      approvedBy,
      branchName,
    );
  }

  private async executeApproval(
    kind: TestKind,
    projectName: string,
    testName: string,
    comparisonId: string,
    approvedBy: string,
    branchName?: string,
  ): Promise<{
    approved: true;
    newBaselineUrl: string;
    signedNewBaselineUrl: string;
  }> {
    return this.tracker.track(TRACKED_OPERATIONS.approval[kind], async () => {
      const test = await this.resolveTestOfKind(
        projectName,
        testName,
        kind,
        comparisonId,
        branchName,
      );

      const config = this.kindConfigs[kind];

      const result = await this.workflow.executeStateChange(
        async () => {
          const comparison = await this.resolve(test.id, comparisonId);
          if (!comparison.baseline || !comparison.candidate) {
            throw new DomainError(
              'Comparison missing baseline or candidate',
              'NOT_FOUND',
            );
          }
          const decision: ApprovalDecision = comparison.approve(
            comparison.baseline,
            comparison.candidate,
          );
          // Keep the baseline that is about to be replaced, so the approval can
          // be undone from the history view. This writes the history row in the
          // same transaction as the baseline overwrite; the previous baseline's
          // file is no longer reclaimed because the revision now references it.
          const revisionUrls =
            await this.baselineHistory.recordOutgoingBaseline({
              testId: test.id,
              variant: decision.newBaseline.variant,
              baseline: comparison.baseline,
              reason: 'approval',
              createdBy: approvedBy,
            });
          const staleDiffUrls = await this.persist(config, decision);
          // The trail is written in the SAME change: an approval never commits
          // without its audit row, and an audit failure rolls the approval back.
          // The row is denormalized from the loaded entities because the
          // comparison is about to be deleted (image) or stripped (PDF).
          await this.approvalAudit.record({
            projectName,
            testName,
            branchName: branchName ?? null,
            testId: test.id,
            runId: comparison.runId ?? null,
            runKey: comparison.runKey ?? null,
            testKind: kind,
            variantViewport: decision.newBaseline.variant.viewport,
            variantBrowser: decision.newBaseline.variant.browser,
            variantEnvironment: decision.newBaseline.variant.environment,
            comparisonId: comparison.id,
            baselineId: decision.baselineId,
            candidateId: decision.candidateId,
            candidateHash: decision.newBaseline.imageHash,
            baselineHash: comparison.baseline?.imageHash ?? null,
            mismatchPixelCount: comparison.mismatchPixelCount,
            mismatchPageCount: comparison.mismatchPageCount ?? null,
            pageCount:
              comparison.pageCount ?? decision.newBaseline.pageCount ?? null,
            approvedBy,
          });
          await this.audit.record({
            actor: approvedBy,
            action: AUDIT_ACTIONS.approval,
            projectName,
            testName,
            branchName: branchName ?? null,
            targetType: 'test',
            targetId: test.id,
            metadata: {
              comparisonId: comparison.id,
              testKind: kind,
              viewport: decision.newBaseline.variant.viewport,
              browser: decision.newBaseline.variant.browser,
              environment: decision.newBaseline.variant.environment,
              mismatchPixelCount: comparison.mismatchPixelCount,
            },
          });
          // Notify subscribed webhook endpoints in the same transaction: an
          // approval never commits without its review notifications. The
          // dispatcher runs in the worker; the API only writes the outbox.
          await this.webhooks.enqueueComparisonApproved({
            projectName,
            testName,
            branchName: branchName ?? null,
            kind,
            variant: {
              viewport: decision.newBaseline.variant.viewport,
              browser: decision.newBaseline.variant.browser,
              environment: decision.newBaseline.variant.environment,
            },
            comparisonId: comparison.id,
            mismatchPixelCount: comparison.mismatchPixelCount,
            approvedBy,
          });
          return {
            change: change([test.id], {
              staleUrls: [...staleDiffUrls, ...revisionUrls],
              events: [
                {
                  kind: 'comparison_approved',
                  baselineId: decision.baselineId,
                  visualTestId: test.id,
                },
                {
                  kind: 'baseline_updated',
                  visualTestId: test.id,
                  baselineId: decision.baselineId,
                },
              ],
            }),
            result: {
              decision,
              newBaselineUrl: decision.newBaselineUrl,
            },
          };
        },
        {
          onSuccess: async ({ result }) => {
            await config.cleanupAfterCommit?.(result.decision);
          },
        },
      );

      return {
        approved: true,
        newBaselineUrl: result.result.newBaselineUrl,
        signedNewBaselineUrl: this.storage.signUrl(
          result.result.newBaselineUrl,
        ),
      };
    });
  }

  // Bulk approval of every comparison still pending for the test on the branch.
  // The owner test is resolved up front (an inherited test is a CONFLICT, an
  // unknown one NOT_FOUND), so the kind is known and the batch can only ever
  // mutate this branch's own rows.
  //
  // The batch deliberately does NOT share one transaction: each comparison goes
  // through the single approval recipe (executeApproval), which keeps its own
  // StateChangeWorkflow transaction and audit row. A comparison superseded
  // mid-loop therefore fails alone and is reported, while the remaining ids
  // still get their chance — the reviewer's "approve all" never silently loses
  // approvals to one stale row.
  async approveAllPending(
    projectName: string,
    testName: string,
    approvedBy: string,
    branchName?: string,
  ): Promise<BulkApprovalResult> {
    const test = await this.testResolver.findOwnTest(
      projectName,
      testName,
      branchName,
    );
    const comparisonIds =
      await this.comparisons.findPendingComparisonIdsForTest(test.id);

    const result: BulkApprovalResult = { approved: 0, failed: [] };
    for (const comparisonId of comparisonIds) {
      try {
        await this.executeApproval(
          test.kind,
          projectName,
          testName,
          comparisonId,
          approvedBy,
          branchName,
        );
        result.approved += 1;
      } catch (error) {
        result.failed.push({
          comparisonId,
          error: bulkFailureMessage(error),
        });
      }
    }
    return result;
  }

  // The audit trail read for the UI: the most recent approvals of a test,
  // newest first. A read-only projection, so it needs no transaction.
  async listApprovals(
    projectName: string,
    testName: string,
    branchName?: string,
  ): Promise<ApprovalAuditRecord[]> {
    return this.approvalAudit.findForTest({
      projectName,
      testName,
      branchName,
    });
  }

  // The approval identifies its target by comparisonId. When the caller also
  // names a branch we resolve that branch's own test (the strict path the UI
  // uses); a client that follows the pre-branch contract and sends only the
  // comparison id resolves the test through the comparison instead, so a
  // feature-branch approval keeps working without learning about branches.
  // `resolve()` re-checks the pairing inside the transaction either way.
  private async resolveTestOfKind(
    projectName: string,
    testName: string,
    kind: TestKind,
    comparisonId: string,
    branchName?: string,
  ): Promise<{ id: string; name: string; kind: TestKind }> {
    if (branchName) {
      return this.testResolver.findTestOfKind(
        projectName,
        testName,
        kind,
        branchName,
      );
    }
    const test = await this.comparisons.findTestOfComparison({
      projectName,
      testName,
      comparisonId,
    });
    if (test) {
      this.testResolver.assertTestKind(test, kind);
      return test;
    }
    // No comparison row (stale or foreign id): fall back to the pre-branch
    // resolution so the error the client sees is the same one it always got.
    return this.testResolver.findTestOfKind(projectName, testName, kind);
  }

  // The reviewer approved a specific comparison; load exactly that one. A
  // missing row (superseded and deleted) or a non-pending row (already
  // approved) means the review target is stale — fail loud instead of approving
  // whatever happens to be pending now.
  private async resolve(
    testId: string,
    comparisonId: string,
  ): Promise<ComparisonEntity> {
    const comparison = await this.comparisons.findByIdForTest(
      testId,
      comparisonId,
    );
    if (!comparison) {
      throw new DomainError('Comparison not found for approval', 'NOT_FOUND');
    }
    if (comparison.status !== ComparisonStatus.PENDING_APPROVAL) {
      throw new DomainError(
        'The comparison you reviewed is no longer pending — it may have been superseded by a newer upload. Refresh to review the latest.',
        'CONFLICT',
      );
    }
    return comparison;
  }

  // The approval recipe, shared by every kind: fold the candidate into the
  // baseline, complete the comparison row (kind-specific), retire the sibling
  // pending comparisons + delete the approved candidate row, and collect the
  // storage URLs to reclaim post-commit. Kinds supply only the kind-specific
  // bits — what to write on the baseline, how to complete the comparison, and
  // the post-commit hook — via APPROVAL_KIND_CONFIG.
  private async persist(
    config: ApprovalKindConfig,
    decision: ApprovalDecision,
  ): Promise<string[]> {
    await this.screenshots.updateBaselineScreenshot(
      decision.baselineId,
      config.baselineUpdateData(decision),
    );
    await this.screenshots.markBaselineOwned(decision.baselineId);

    const diffArtifactUrls = await config.completeComparison(decision);

    const stale = await this.retireAndDeleteCandidate(decision);
    return [
      ...(await this.collectApprovalUrls(decision, diffArtifactUrls)),
      ...stale,
    ];
  }

  // Upholds the "at most one reviewable comparison per Variant" invariant after
  // approval: retire sibling pending comparisons, delete the approved candidate
  // row, and merge the storage URLs to reclaim post-commit. The approved
  // comparison itself is already gone (image) or APPROVED (PDF), so retirement
  // needs no keep.
  private async retireAndDeleteCandidate(
    decision: ApprovalDecision,
  ): Promise<string[]> {
    return this.retirement.retireSiblingsAndDeleteCandidate(
      decision.visualTestId,
      decision.newBaseline.variant,
      decision.candidateId,
    );
  }

  // Single source for the storage URLs an approval reclaims post-commit: the
  // previous baseline and the kind's diff artifact. Funnels through the
  // "safe to reclaim" owner so a URL a baseline or live comparison still
  // references is dropped before it reaches the stale channel.
  private async collectApprovalUrls(
    decision: ApprovalDecision,
    diffArtifactUrls: string[],
  ): Promise<string[]> {
    return this.screenshots.filterReclaimableUrls(
      [decision.previousBaselineUrl, ...diffArtifactUrls].filter(Boolean),
    );
  }
}

// The per-kind approval bits, keyed by kind. Stays an interface so the config
// shape (baseline write, comparison completion, post-commit hook) is explicit.
interface ApprovalKindConfig {
  baselineUpdateData(decision: ApprovalDecision): {
    imageHash: string;
    imageUrl: string;
    pageCount?: number | null;
  };
  completeComparison(decision: ApprovalDecision): Promise<string[]>;
  cleanupAfterCommit?(decision: ApprovalDecision): Promise<void>;
}

// A bulk approval's outcome: how many comparisons were approved, plus one entry
// per comparison that failed (the batch continues past failures).
export interface BulkApprovalResult {
  approved: number;
  failed: { comparisonId: string; error: string }[];
}

// A DomainError's message is written for the client and safe to return; any
// other error is an internal failure whose text could leak implementation
// detail, so the batch reports a generic message for it.
function bulkFailureMessage(error: unknown): string {
  return error instanceof DomainError ? error.message : 'Approval failed';
}
