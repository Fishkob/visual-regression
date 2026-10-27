import { createHash, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Tracker } from '@common/tracker/tracker.service';
import { DomainError } from '@common/domain/domain-error';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import {
  change,
  noop,
  type PersistedChange,
  type StateChangeOutcome,
} from '@public/visualTest/core/application/services/state-change-options';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { assertNever } from '@common/utils/assert-never';
import {
  type BaselineCreatedUploadDecision,
  type ComparisonQueuedUploadDecision,
  type UploadDecision,
} from '@public/visualTest/core/domain/policies/upload-decision-policy';
import {
  UploadParams,
  toVariant,
} from '@public/visualTest/intake/application/upload-params';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { JOB_PRODUCER, IJobProducer } from '@common/domain/job-queue.interface';
import {
  ComparisonOutcome,
  ComparisonErrorCode,
} from '@common/domain/upload-outcome';
import { UploadDecisionResolver } from '@public/visualTest/intake/application/upload-decision.resolver';
import type { JobData } from '@common/domain/job-data.types';
import { RunResolver } from '@public/visualTest/core/application/services/run-resolver.service';
import { ImageNormalizer } from '@public/visualTest/core/application/services/image-normalizer.service';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import type { ResolvedBranch } from '@public/visualTest/core/application/services/branch-resolver.service';
import type { Run } from '@/prisma/client';
import type { AnyUploadResult } from '@common/domain/unified-upload-result.type';
import { DEFAULT_BRANCH_NAME } from '@public/visualTest/core/domain/constants/branch.constants';
import type { TestKind } from '@common/domain/test-kind';
import {
  KIND_FILE_EXTENSIONS,
  KIND_MIME_TYPES,
} from '@common/domain/test-kind';
import { TRACKED_OPERATIONS } from '@common/domain/metrics-catalog';
import {
  PDF_PAGE_COUNTER,
  IPdfPageCounter,
} from '@common/domain/pdf-sidecar.interface';
import { MAX_PDF_PAGES } from '@config/upload-limits';

interface UploadKindConfig {
  trackerSpanName: string;
  queuedErrorCode: ComparisonErrorCode;
  queuedMessage: string;
}

// The per-kind variance for the upload pipeline: the tracker span name and the
// queued result copy. Everything else (decision, baseline/candidate writes,
// file naming) is kind-agnostic and lives in the service. The only behavioral
// hook is the PDF page count, handled as a single branch below.
const UPLOAD_KIND_CONFIG: Record<TestKind, UploadKindConfig> = {
  image: {
    trackerSpanName: TRACKED_OPERATIONS.upload.image,
    queuedErrorCode: ComparisonErrorCode.IMAGE_DIFFERENCE,
    queuedMessage: 'Comparison queued — check test results.',
  },
  pdf: {
    trackerSpanName: TRACKED_OPERATIONS.upload.pdf,
    queuedErrorCode: ComparisonErrorCode.PDF_DIFFERENCE,
    queuedMessage: 'PDF comparison queued — check test results.',
  },
};

interface PreparedComparison {
  staleUrls: string[];
  jobData: JobData;
}

@Injectable()
export class UploadIntake {
  constructor(
    private readonly tracker: Tracker,
    private readonly workflow: StateChangeWorkflow,
    private readonly retirement: ComparisonRetirementService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly decisions: UploadDecisionResolver,
    private readonly screenshots: UnifiedScreenshotRepository,
    @Inject(JOB_PRODUCER) private readonly jobQueue: IJobProducer,
    @Inject(PDF_PAGE_COUNTER) private readonly pageCounter: IPdfPageCounter,
    private readonly runs: RunResolver,
    private readonly images: ImageNormalizer,
    private readonly tests: UnifiedTestRepository,
  ) {}

  async upload(input: UploadParams, kind: TestKind): Promise<AnyUploadResult> {
    assertKindMatchesMime(kind, input.file.mimetype);
    let params = input;
    if (kind === 'image' && params.file.mimetype !== 'image/png') {
      const png = await this.images.toPng(params.file.buffer);
      params = {
        ...params,
        file: {
          ...params.file,
          buffer: png,
          mimetype: 'image/png',
          size: png.length,
        },
      };
    }
    return this.tracker.track(
      UPLOAD_KIND_CONFIG[kind].trackerSpanName,
      async () => {
        const fileHash = createHash('sha256')
          .update(params.file.buffer)
          .digest('hex');

        // The identical fast path is a pure gate: it avoids storing a file that
        // the stored path would immediately discard, and it never creates a
        // project/test row (a failed upload must not leave side effects behind).
        // It re-resolves inside its own retried Serializable transaction; if a
        // concurrent approval replaced the baseline in between, it returns null
        // and the stored path below re-resolves atomically and wins.
        const identicalDecision = await this.decisions.peekIdentical(
          params,
          fileHash,
        );
        if (identicalDecision !== null) {
          const identicalResult = await this.tryIdentical(
            kind,
            params,
            fileHash,
          );
          if (identicalResult !== null) return identicalResult;
        }

        // Resolve the document page count outside the transaction. For PDFs this
        // hits the sidecar over HTTP — doing it here keeps the network call out
        // of the Serializable transaction and avoids re-invoking it on retry.
        const pageCount =
          kind === 'pdf'
            ? await this.pageCounter.count(params.file.buffer)
            : undefined;

        // Reject before storing: an over-limit document must not leave an
        // object behind (or a test/variant row) after the upload fails.
        if (pageCount !== undefined && pageCount > MAX_PDF_PAGES) {
          throw new DomainError(
            `PDF has too many pages (${String(pageCount)}); maximum is ${String(MAX_PDF_PAGES)}`,
            'BAD_REQUEST',
          );
        }

        const stored = await this.workflow.executeWithStoredFile({
          // The quota rides the stored write (ADR-043): the workflow rejects a
          // projected overrun before this object exists, so a failed upload
          // leaves neither a file nor a row behind.
          charge: { projectName: params.projectName, bytes: params.file.size },
          store: () => this.storeUpload(kind, fileHash, params),
          change: async (fileUrl) => {
            const fresh = await this.decisions.resolveStored(
              kind,
              params,
              fileHash,
            );
            return this.applyStoredChange(
              kind,
              fresh.decision,
              fresh.branch,
              params,
              fileUrl,
              pageCount,
              fileHash,
            );
          },
        });

        return stored.result;
      },
    );
  }

  private async tryIdentical(
    kind: TestKind,
    params: UploadParams,
    fileHash: string,
  ): Promise<AnyUploadResult | null> {
    const outcome = await this.workflow.executeStateChange<{
      superseded: boolean;
      branchName?: string;
      runKey?: string;
    }>(async () => {
      // Read-only re-resolution inside the transaction: the gate must not
      // ensureTest, otherwise a test deleted between the gate and here is
      // resurrected and the noop commits its freshly created rows. peekIdentical
      // is the side-effect-free resolution shape — it never ensures a row.
      const fresh = await this.decisions.peekIdentical(params, fileHash);
      if (!fresh) {
        return { change: noop(), result: { superseded: false } };
      }
      const run = await this.resolveRun(fresh.branch, params);
      if (run) {
        await this.recordRunUpload(
          run.id,
          fresh.testId,
          kind,
          params,
          fileHash,
          ComparisonOutcome.IDENTICAL,
        );
      }
      const superseded = await this.supersedeIdentical(fresh.testId, params);
      return {
        change: superseded,
        result: {
          superseded: true,
          branchName: fresh.branch.branchName,
          runKey: run?.key,
        },
      };
    });
    if (!outcome.result.superseded) return null;
    return identicalResult(
      outcome.result.branchName ?? DEFAULT_BRANCH_NAME,
      outcome.result.runKey,
    );
  }

  // An identical upload retires the variant's pending comparison + candidate
  // and cancels its queued diff jobs. One owner for the identical rule: both
  // the fast path and the stored path (which re-resolves after a concurrent
  // baseline replacement) produce the same outcome + stale files.
  private async supersedeIdentical(
    testId: string,
    params: UploadParams,
  ): Promise<Extract<PersistedChange, { kind: 'change' }>> {
    const variant = toVariant(params);
    // One recipe owns the identical retirement: supersede the pending change
    // (cancel queued jobs) and reclaim the CURRENT candidate row, so a
    // PROCESSING diff job's only supersede-detector (the CURRENT row's hash)
    // fails and it retires its moot candidate instead of committing a stale
    // comparison.
    const staleUrls = await this.retirement.supersedeIdenticalForVariant(
      testId,
      variant,
    );
    return change([testId], { staleUrls });
  }

  private async applyStoredChange(
    kind: TestKind,
    fresh: UploadDecision,
    branch: ResolvedBranch,
    params: UploadParams,
    fileUrl: string,
    pageCount?: number,
    fileHash?: string,
  ): Promise<StateChangeOutcome<AnyUploadResult>> {
    const run = await this.resolveRun(branch, params);
    if (run && fileHash) {
      await this.recordRunUpload(
        run.id,
        fresh.testId,
        kind,
        params,
        fileHash,
        fresh.status,
      );
    }
    switch (fresh.status) {
      case ComparisonOutcome.IDENTICAL: {
        const identical = await this.supersedeIdentical(fresh.testId, params);
        return {
          change: change(identical.affectedTestIds, {
            // The stored file was written for nothing — reclaim it through the
            // workflow's single post-commit stale-file channel alongside the
            // retired diff artifacts.
            staleUrls: [fileUrl, ...(identical.staleUrls ?? [])],
          }),
          result: identicalResult(branch.branchName, run?.key),
        };
      }
      case ComparisonOutcome.BASELINE_CREATED: {
        await this.writeBaseline(fresh, params, fileUrl, pageCount);
        return {
          change: change([fresh.testId], {
            events: [
              {
                kind: 'screenshot_uploaded',
                visualTestId: fresh.testId,
                type: 'BASELINE',
              },
            ],
          }),
          result: {
            status: ComparisonOutcome.BASELINE_CREATED,
            testId: fresh.testId,
            fileUrl,
            signedFileUrl: this.storage.signUrl(fileUrl),
            branch: branch.branchName,
            ...(run?.key ? { runKey: run.key } : {}),
          } as const,
        };
      }
      case ComparisonOutcome.COMPARISON_QUEUED: {
        const { staleUrls, jobId } = await this.writeComparisonAndEnqueue(
          kind,
          fresh,
          params,
          fileUrl,
          pageCount,
          run,
        );
        return {
          change: change([fresh.testId], {
            staleUrls,
            events: [
              {
                kind: 'screenshot_uploaded',
                visualTestId: fresh.testId,
                type: 'CURRENT',
              },
            ],
          }),
          result: this.queuedResult(kind, branch.branchName, jobId, run?.key),
        };
      }
      default:
        return assertNever(fresh);
    }
  }

  private storeUpload(
    kind: TestKind,
    contentHash: string,
    params: UploadParams,
  ): Promise<string> {
    const fileName = uploadObjectName(kind, contentHash);
    return this.storage.putObject(
      fileName,
      params.file.buffer,
      KIND_MIME_TYPES[kind],
    );
  }

  private queuedResult(
    kind: TestKind,
    branch: string,
    jobId: string,
    runKey?: string,
  ): AnyUploadResult {
    const config = UPLOAD_KIND_CONFIG[kind];
    return {
      status: ComparisonOutcome.COMPARISON_QUEUED,
      error: config.queuedErrorCode,
      message: config.queuedMessage,
      branch,
      jobId,
      ...(runKey ? { runKey } : {}),
    };
  }

  private recordRunUpload(
    runId: string,
    testId: string,
    kind: TestKind,
    params: UploadParams,
    contentHash: string,
    outcome: ComparisonOutcome,
  ): Promise<void> {
    return this.runs.recordUpload({
      runId,
      testId,
      kind,
      viewport: params.viewport,
      browser: params.browser,
      environment: params.environment,
      contentHash,
      outcome,
    });
  }

  private resolveRun(
    branch: ResolvedBranch,
    params: UploadParams,
  ): Promise<Run | null> {
    return this.runs.resolveForUpload({
      projectId: branch.projectId,
      branchId: branch.branchId,
      runKey: params.runKey,
      commitSha: params.commitSha,
      commitMessage: params.commitMessage,
      ciUrl: params.ciUrl,
    });
  }

  private async writeBaseline(
    decision: BaselineCreatedUploadDecision,
    params: UploadParams,
    fileUrl: string,
    pageCount?: number,
  ): Promise<void> {
    await this.screenshots.upsertBaselineForVariant({
      testId: decision.testId,
      contentHash: decision.contentHash,
      contentUrl: fileUrl,
      variant: toVariant(params),
      pageCount,
      sizeBytes: params.file.size,
    });
  }

  private async writeComparisonAndEnqueue(
    kind: TestKind,
    decision: ComparisonQueuedUploadDecision,
    params: UploadParams,
    fileUrl: string,
    pageCount?: number,
    run?: Run | null,
  ): Promise<{ staleUrls: string[]; jobId: string }> {
    const staleUrls = await this.retirement.supersedeForVariant(
      decision.testId,
      toVariant(params),
    );
    const prepared = await this.prepareComparison(
      kind,
      decision,
      params,
      fileUrl,
      pageCount,
      run,
    );
    const jobId = await this.jobQueue.enqueue(prepared.jobData);
    return { staleUrls: [...staleUrls, ...prepared.staleUrls], jobId };
  }

  private async createCandidate(
    decision: ComparisonQueuedUploadDecision,
    params: UploadParams,
    fileUrl: string,
    pageCount?: number,
  ): Promise<{ id: string; replacedUrl: string | null }> {
    return this.screenshots.upsertCandidateForVariant({
      testId: decision.testId,
      contentHash: decision.contentHash,
      contentUrl: fileUrl,
      variant: toVariant(params),
      pageCount,
      sizeBytes: params.file.size,
    });
  }

  private async prepareComparison(
    kind: TestKind,
    decision: ComparisonQueuedUploadDecision,
    params: UploadParams,
    fileUrl: string,
    pageCount?: number,
    run?: Run | null,
  ): Promise<PreparedComparison> {
    const { testId, contentHash, baseline } = decision;
    const variant = toVariant(params);
    const sizePolicy = await this.tests.findSizePolicy(testId);
    const candidate = await this.createCandidate(
      decision,
      params,
      fileUrl,
      pageCount,
    );
    const jobData: JobData = {
      testKind: kind,
      testId,
      testName: params.testName,
      // Denormalized so the worker can charge its diff artifact without a
      // test->branch->project query per comparison (ADR-043).
      projectName: params.projectName,
      candidateHash: contentHash,
      candidate: { id: candidate.id, url: fileUrl },
      baseline: { id: baseline.id, url: baseline.fileUrl },
      variant: variant.toRecord(),
      ...(sizePolicy ? { sizePolicy } : {}),
      ...(run ? { runId: run.id, runKey: run.key } : {}),
    };
    // The replaced candidate URL funnels through the same "safe to reclaim"
    // owner every other reclamation uses, so an old candidate file that a
    // baseline or live comparison still references is never deleted.
    const replacedUrls = candidate.replacedUrl
      ? await this.screenshots.filterReclaimableUrls([candidate.replacedUrl])
      : [];
    return {
      staleUrls: replacedUrls,
      jobData,
    };
  }
}

const IMAGE_UPLOAD_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function assertKindMatchesMime(kind: TestKind, mimetype: string): void {
  if (kind === 'image') {
    if (!IMAGE_UPLOAD_MIME_TYPES.has(mimetype)) {
      throw new DomainError(
        `MIME type "${mimetype}" does not match test kind "image" (PNG, JPEG or WebP required)`,
        'BAD_REQUEST',
      );
    }
    return;
  }
  const expected = KIND_MIME_TYPES[kind];
  if (mimetype !== expected) {
    throw new DomainError(
      `MIME type "${mimetype}" does not match test kind "${kind}"`,
      'BAD_REQUEST',
    );
  }
}

// The identical outcome, single-sourced: both the fast path and the stored
// path (which re-resolves after a concurrent baseline replacement) return the
// same shape, so the upload result contract edits in one place.
function identicalResult(branch: string, runKey?: string): AnyUploadResult {
  return {
    status: ComparisonOutcome.IDENTICAL,
    mismatchPixelCount: 0,
    branch,
    ...(runKey ? { runKey } : {}),
  };
}

// A per-upload unique object name: a fresh randomUUID guarantees two uploads of
// identical content (and even identical clocks) never collide.
export function uploadObjectName(kind: TestKind, hash: string): string {
  return `${hash}-${randomUUID()}.${KIND_FILE_EXTENSIONS[kind]}`;
}
