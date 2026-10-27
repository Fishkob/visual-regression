import { Injectable, Inject } from '@nestjs/common';
import { Tracker } from '@common/tracker/tracker.service';
import { DomainError } from '@common/domain/domain-error';
import type { ApprovalPrincipal } from '@common/domain/approval-principal';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { change } from '@public/visualTest/core/application/services/state-change-options';
import type { TestKind } from '@common/domain/test-kind';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import {
  ApprovalDecision,
  ComparisonEntity,
} from '@public/visualTest/core/domain/entities/comparison.entity';
import type { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import {
  ApprovalAuditRepository,
  type ApprovalAuditRecord,
} from '@public/visualTest/core/infrastructure/repositories/approval-audit.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ApprovalVoteRepository } from '@public/visualTest/review/infrastructure/repositories/approval-vote.repository';
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

export interface ApprovedResult {
  approved: true;
  newBaselineUrl: string;
  signedNewBaselineUrl: string;
}

export interface ApprovalPendingResult {
  approved: false;
  requiresMoreApprovals: true;
  votes: number;
  required: number;
}

export type ApprovalResult = ApprovedResult | ApprovalPendingResult;

export interface ApprovalDecisionOptions extends ApprovalPrincipal {
  reason?: 'INTENDED_CHANGE' | 'FLAKE' | 'INFRA';
  note?: string;
}

type ApprovalChangeResult =
  | {
      approved: true;
      decision: ApprovalDecision;
      newBaselineUrl: string;
    }
  | ApprovalPendingResult;

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
    private readonly projects: ProjectRepository,
    private readonly votes: ApprovalVoteRepository,
  ) {}

  private async requireMoreApprovals(input: {
    comparisonId: string;
    projectName: string;
    testName: string;
    branchName?: string;
    testId: string;
    approvedBy: string;
    principal: ApprovalPrincipal;
  }): Promise<{ partial: true; votes: number; required: number } | null> {
    const project = await this.projects.findByName(input.projectName);
    const required = Math.max(1, project?.requiredApprovals ?? 1);
    if (required <= 1) return null;
    // A 4-eyes gate counts humans: a CI key is one credential a single operator
    // controls, so allowing it to vote would let that operator satisfy N>1.
    if (input.principal.principalType === 'apiKey') {
      throw new DomainError(
        '4-eyes approvals require signed-in reviewers; API keys cannot approve a comparison that needs more than one approval',
        'FORBIDDEN',
      );
    }
    if (
      await this.votes.hasVoted(input.comparisonId, input.principal.principalId)
    ) {
      throw new DomainError(
        'You have already approved this comparison',
        'CONFLICT',
      );
    }
    const existing = await this.votes.countForComparison(input.comparisonId);
    await this.votes.record({
      comparisonId: input.comparisonId,
      projectName: input.projectName,
      testId: input.testId,
      userId: input.principal.principalId,
      username: input.approvedBy,
    });
    const votes = existing + 1;
    if (votes < required) {
      // The vote row and its audit row commit together, so a partial vote can
      // never exist without the trail that proves who cast it.
      await this.audit.record({
        actor: input.approvedBy,
        action: AUDIT_ACTIONS.reviewVote,
        projectName: input.projectName,
        testName: input.testName,
        branchName: input.branchName ?? null,
        targetType: 'comparison',
        targetId: input.comparisonId,
        metadata: {
          comparisonId: input.comparisonId,
          votes,
          required,
          principalType: input.principal.principalType,
        },
      });
      return { partial: true, votes, required };
    }
    return null;
  }

  async approveImage(
    projectName: string,
    testName: string,
    comparisonId: string,
    approvedBy: string,
    branchName: string | undefined,
    options: ApprovalDecisionOptions,
  ): Promise<ApprovalResult> {
    return this.executeApproval(
      'image',
      projectName,
      testName,
      comparisonId,
      approvedBy,
      branchName,
      options,
    );
  }

  async approvePdf(
    projectName: string,
    testName: string,
    comparisonId: string,
    approvedBy: string,
    branchName: string | undefined,
    options: ApprovalDecisionOptions,
  ): Promise<ApprovalResult> {
    return this.executeApproval(
      'pdf',
      projectName,
      testName,
      comparisonId,
      approvedBy,
      branchName,
      options,
    );
  }

  private async executeApproval(
    kind: TestKind,
    projectName: string,
    testName: string,
    comparisonId: string,
    approvedBy: string,
    branchName: string | undefined,
    options: ApprovalDecisionOptions,
  ): Promise<ApprovalResult> {
    return this.tracker.track(TRACKED_OPERATIONS.approval[kind], async () => {
      const test = await this.resolveTestOfKind(
        projectName,
        testName,
        kind,
        comparisonId,
        branchName,
      );

      const config = this.kindConfigs[kind];

      const result =
        await this.workflow.executeStateChange<ApprovalChangeResult>(
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
            const partial = await this.requireMoreApprovals({
              comparisonId: comparison.id,
              projectName,
              testName,
              branchName,
              testId: test.id,
              approvedBy,
              principal: options,
            });
            if (partial) {
              return {
                change: change([test.id]),
                result: {
                  approved: false as const,
                  requiresMoreApprovals: true as const,
                  votes: partial.votes,
                  required: partial.required,
                },
              };
            }
            // The overwrite keeps the outgoing baseline as a revision in the same
            // transaction, so the approval can be undone from the history view and
            // the previous file stays referenced (see
            // BaselineHistoryService.overwriteKeepingHistory).
            const staleDiffUrls = await this.persist(config, decision, {
              testId: test.id,
              baseline: comparison.baseline,
              createdBy: approvedBy,
            });
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
              reason: options?.reason ?? null,
              note: options?.note ?? null,
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
                reason: options?.reason ?? null,
                note: options?.note ?? null,
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
              reason: options?.reason ?? null,
              note: options?.note ?? null,
            });
            return {
              change: change([test.id], {
                staleUrls: staleDiffUrls,
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
                approved: true as const,
                decision,
                newBaselineUrl: decision.newBaselineUrl,
              },
            };
          },
          {
            onSuccess: async ({ result }) => {
              if (result.approved && 'decision' in result) {
                await config.cleanupAfterCommit?.(result.decision);
              }
            },
          },
        );

      if (!result.result.approved) {
        return result.result;
      }
      return {
        approved: true,
        newBaselineUrl: result.result.newBaselineUrl,
        signedNewBaselineUrl: this.storage.signUrl(
          result.result.newBaselineUrl,
        ),
      };
    });
  }

  // One entry point for "approve these comparisons", addressed by comparison id
  // with the owning test already resolved by the caller — a run's pending row, a
  // bulk selection, a test's pending list. The kind dispatch and the batch's
  // failure policy live here rather than at every call site: of the three loops
  // this replaces, two shipped raw internal error text to the browser because
  // the policy had been re-written per loop.
  //
  // The batch deliberately does NOT share one transaction: each comparison goes
  // through the single approval recipe (executeApproval), which keeps its own
  // StateChangeWorkflow transaction and audit row. A comparison superseded
  // mid-loop therefore fails alone and is reported, while the remaining ids
  // still get their chance — the reviewer's "approve all" never silently loses
  // approvals to one stale row.
  async approveMany(
    projectName: string,
    targets: readonly ApproveTarget[],
    approvedBy: string,
    principal: ApprovalPrincipal,
  ): Promise<ApprovalBatch> {
    const result = new ApprovalBatch([], [], []);
    for (const target of targets) {
      try {
        const outcome = await this.executeApproval(
          target.kind,
          projectName,
          target.testName,
          target.comparisonId,
          approvedBy,
          target.branchName,
          principal,
        );
        if (!outcome.approved) {
          result.pending.push({
            comparisonId: target.comparisonId,
            votes: outcome.votes,
            required: outcome.required,
          });
        } else {
          result.approved.push(target.comparisonId);
        }
      } catch (error) {
        result.failed.push({
          comparisonId: target.comparisonId,
          error: bulkFailureMessage(error, 'Approval failed'),
        });
      }
    }
    return result;
  }

  // Bulk approval of every comparison still pending for the test on the branch.
  // The owner test is resolved up front (an inherited test is a CONFLICT, an
  // unknown one NOT_FOUND), so the batch can only ever mutate this branch's own
  // rows.
  async approveAllPending(
    projectName: string,
    testName: string,
    approvedBy: string,
    principal: ApprovalPrincipal,
    branchName?: string,
  ): Promise<CountedApprovalBatch> {
    const test = await this.testResolver.findOwnTest(
      projectName,
      testName,
      branchName,
    );
    const comparisonIds =
      await this.comparisons.findPendingComparisonIdsForTest(test.id);

    const batch = await this.approveMany(
      projectName,
      comparisonIds.map((comparisonId) => ({
        comparisonId,
        testName,
        kind: test.kind,
        branchName,
      })),
      approvedBy,
      principal,
    );
    return batch.counts();
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

  // The approval recipe, shared by every kind: replace the baseline's content
  // (keeping the outgoing row as a revision), claim the variant as branch-owned,
  // complete the comparison row (kind-specific), retire the sibling pending
  // comparisons + delete the approved candidate row, and collect the storage
  // URLs to reclaim post-commit. Kinds supply only the kind-specific bits — what
  // to write on the baseline, how to complete the comparison, and the
  // post-commit hook — via APPROVAL_KIND_CONFIG.
  private async persist(
    config: ApprovalKindConfig,
    decision: ApprovalDecision,
    context: {
      testId: string;
      baseline: ScreenshotEntity;
      createdBy: string;
    },
  ): Promise<string[]> {
    const revisionUrls = await this.baselineHistory.overwriteKeepingHistory({
      testId: context.testId,
      variant: decision.newBaseline.variant,
      current: context.baseline,
      reason: 'approval',
      createdBy: context.createdBy,
      next: config.baselineUpdateData(decision),
    });
    await this.screenshots.markBaselineOwned(decision.baselineId);

    const diffArtifactUrls = await config.completeComparison(decision);

    const stale = await this.retireAndDeleteCandidate(decision);
    return [
      ...revisionUrls,
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

// One comparison a batch should approve, with the owning test already resolved
// by the caller. Carrying the kind lets the batch dispatch without a second
// lookup, and it is the caller's own row, so a stale kind can only mean the test
// was re-kinded mid-batch — which the in-transaction resolution rejects.
export interface ApproveTarget {
  comparisonId: string;
  testName: string;
  kind: TestKind;
  branchName?: string;
}

export interface BatchPendingVote {
  comparisonId: string;
  votes: number;
  required: number;
}

export interface BatchFailure {
  comparisonId: string;
  error: string;
}

// A caller whose response is a summary: "how many were approved".
export interface CountedApprovalBatch {
  approved: number;
  pending: BatchPendingVote[];
  failed: BatchFailure[];
}

// A caller whose response lists the selection it sent.
export interface ListedApprovalBatch {
  approved: { id: string; success: true }[];
  pending: { id: string; votes: number; required: number }[];
  failed: { id: string; success: false; error: string }[];
}

// The batch's outcome, and the only place its shape is decided. Every
// "approve many" call site — a run's approve-all, the test's pending list, a
// cross-test bulk selection — projects this one result; before, each declared
// its own near-identical shape (two of them under the same exported name) and
// re-wrote the failure policy next to it.
export class ApprovalBatch {
  constructor(
    readonly approved: string[],
    readonly pending: BatchPendingVote[],
    readonly failed: BatchFailure[],
  ) {}

  // The summary projection: a run reports a count.
  counts(): CountedApprovalBatch {
    return {
      approved: this.approved.length,
      pending: this.pending,
      failed: this.failed,
    };
  }

  // The listing projection: a bulk selection reports one row per comparison.
  rows(): ListedApprovalBatch {
    return {
      approved: this.approved.map((id) => ({ id, success: true })),
      pending: this.pending.map((vote) => ({
        id: vote.comparisonId,
        votes: vote.votes,
        required: vote.required,
      })),
      failed: this.failed.map((failure) => ({
        id: failure.comparisonId,
        success: false,
        error: failure.error,
      })),
    };
  }
}

// A DomainError's message is written for the client and safe to return; any
// other error is an internal failure whose text could leak implementation
// detail, so a batch reports the operation's generic message instead. The
// policy is one function because the bulk delete/move loops had re-spelled it —
// one of them without the guard, so internal text reached the browser. Only the
// noun differs per operation, so the caller supplies it.
export function bulkFailureMessage(error: unknown, fallback: string): string {
  return error instanceof DomainError ? error.message : fallback;
}
