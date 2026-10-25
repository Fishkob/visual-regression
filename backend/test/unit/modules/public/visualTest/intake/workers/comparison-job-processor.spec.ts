import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  COMPARISON_ENGINES,
  type IComparisonEngine,
} from '@common/domain/comparison-engine.interface';
import { Tracker } from '@common/tracker/tracker.service';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { CandidateReclamationService } from '@public/visualTest/core/application/services/candidate-reclamation.service';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { ComparisonOutcomeService } from '@public/visualTest/core/application/services/comparison-outcome.service';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import type { QueuedJob } from '@common/domain/job-queue.interface';
import type { JobData } from '@common/domain/job-data.types';
import type { ComparisonResult } from '@common/domain/comparison-engine.interface';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { createMock } from '@test/utils/create-mock';
import { createMockUoW, createMockLogger } from '@test/utils/mocks';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { DomainError } from '@common/domain/domain-error';
import { context, propagation } from '@opentelemetry/api';

describe('ComparisonJobProcessor', () => {
  let processor: ComparisonJobProcessor;
  let imageEngine: Mocked<IComparisonEngine>;
  let pdfEngine: Mocked<IComparisonEngine>;
  let storage: Mocked<IStorageProvider>;
  let retirement: Mocked<ComparisonRetirementService>;
  let reclamation: Mocked<CandidateReclamationService>;
  let webhooks: Mocked<WebhookDispatchService>;
  let outcomes: Mocked<ComparisonOutcomeService>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let metrics: Mocked<IMetricsRecorder>;
  let uow: Mocked<PrismaUnitOfWork>;

  const imageJobData: JobData = {
    testKind: 'image',
    testId: 'test-1',
    testName: 'checkout',
    runId: 'run-1',
    runKey: 'ci-1',
    candidateHash: 'hash-from-upload',
    candidate: {
      id: 'candidate-1',
      url: 'http://storage/candidate.png',
    },
    baseline: {
      id: 'baseline-1',
      url: 'http://storage/baseline.png',
    },
    variant: {
      viewport: '1920x1080',
      browser: 'chrome',
      environment: 'staging',
    },
  };

  const pdfJobData: JobData = {
    testKind: 'pdf',
    testId: 'test-1',
    candidateHash: 'hash-from-upload',
    candidate: { id: 'candidate-1', url: 'http://storage/candidate.pdf' },
    baseline: { id: 'baseline-1', url: 'http://storage/baseline.pdf' },
    variant: {
      viewport: '1920x1080',
      browser: 'chrome',
      environment: 'staging',
    },
  };

  const imageUnchanged: ComparisonResult = {
    kind: 'image',
    mismatchPixelCount: 0,
    diffOutput: Buffer.from(''),
    pageCount: 0,
  };

  const imageDiff: ComparisonResult = {
    kind: 'image',
    mismatchPixelCount: 15,
    diffOutput: Buffer.from('diff-data'),
  };

  const pdfDiff: ComparisonResult = {
    kind: 'pdf',
    mismatchPageCount: 3,
    diffOutput: Buffer.from('diff-pdf-data'),
    pageCount: 10,
  };

  function makeJob(payload: JobData): QueuedJob {
    return {
      id: 'job-1',
      payload,
    };
  }

  beforeEach(async () => {
    imageEngine = {
      kind: 'image',
      compare: vi.fn(),
    } as unknown as Mocked<IComparisonEngine>;
    pdfEngine = {
      kind: 'pdf',
      compare: vi.fn(),
    } as unknown as Mocked<IComparisonEngine>;
    storage = createMock<IStorageProvider>();
    retirement = createMock<ComparisonRetirementService>();
    reclamation = createMock<CandidateReclamationService>();
    webhooks = createMock<WebhookDispatchService>();
    webhooks.enqueueReviewRequested.mockResolvedValue(0);
    outcomes = createMock<ComparisonOutcomeService>();
    outcomes.record.mockResolvedValue(undefined);
    screenshots = createMock<UnifiedScreenshotRepository>();
    metrics = createMock<IMetricsRecorder>();
    metrics.incrementCounter.mockReturnValue(undefined);
    metrics.observeHistogram.mockReturnValue(undefined);
    uow = createMockUoW() as unknown as Mocked<PrismaUnitOfWork>;
    const statusService = createMock<TestStatusService>();
    statusService.recomputeStatus.mockResolvedValue(undefined);

    screenshots.findBaselineByVariant.mockResolvedValue({
      id: 'baseline-1',
      imageUrl: 'http://storage/baseline.png',
    } as never);

    storage.get.mockResolvedValue(Buffer.from('file-data'));
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

    const tracker = createMock<Tracker>();
    tracker.track.mockImplementation((_: string, fn: () => Promise<any>) =>
      fn(),
    );

    reclamation.reclaimCandidateInChange.mockImplementation(
      async ({ testId, events, ...rest }) => {
        const { resolveCandidate } = rest as {
          resolveCandidate?: () => Promise<{ id: string }>;
        };
        if (resolveCandidate) await resolveCandidate();
        return {
          kind: 'change',
          affectedTestIds: [testId],
          staleUrls: [],
          events: events ?? [],
        };
      },
    );
    retirement.createPendingForVariant.mockResolvedValue({
      id: 'comp-1',
      staleUrls: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparisonJobProcessor,
        { provide: ComparisonRetirementService, useValue: retirement },
        { provide: CandidateReclamationService, useValue: reclamation },
        { provide: WebhookDispatchService, useValue: webhooks },
        { provide: ComparisonOutcomeService, useValue: outcomes },
        {
          provide: COMPARISON_ENGINES,
          useValue: { image: imageEngine, pdf: pdfEngine },
        },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: Tracker, useValue: tracker },
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: PrismaUnitOfWork, useValue: uow },
        { provide: AppLoggerService, useValue: createMockLogger() },
        { provide: TestStatusService, useValue: statusService },
        { provide: METRICS_RECORDER, useValue: metrics },
        StateChangeWorkflow,
      ],
    }).compile();

    processor = module.get(ComparisonJobProcessor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function completedEventLabels(): Array<Record<string, string>> {
    return metrics.incrementCounter.mock.calls
      .filter(([name]) => name === 'domain_events_total')
      .map(([, labels]) => labels as Record<string, string>);
  }

  describe('engine dispatch', () => {
    it('processes an image job through the image engine', async () => {
      const job = makeJob(imageJobData);
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      imageEngine.compare.mockResolvedValue(imageUnchanged);

      await processor.processJob(job);

      expect(storage.get).toHaveBeenCalledTimes(2);
      expect(storage.get).toHaveBeenCalledWith('http://storage/baseline.png');
      expect(storage.get).toHaveBeenCalledWith('http://storage/candidate.png');
      expect(imageEngine.compare).toHaveBeenCalledWith(
        Buffer.from('file-data'),
        Buffer.from('file-data'),
        { sizePolicy: 'FAIL' },
      );
    });

    it('restores the trace context from the job payload when present', async () => {
      const traceContext = { traceparent: '00-abc-123-01' };
      const job = makeJob({ ...imageJobData, traceContext });
      const extractSpy = vi
        .spyOn(propagation, 'extract')
        .mockReturnValue({ traceId: 'extracted' } as never);
      const withSpy = vi
        .spyOn(context, 'with')
        .mockImplementation((_ctx, fn) => fn());
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      imageEngine.compare.mockResolvedValue(imageUnchanged);

      await processor.processJob(job);

      expect(extractSpy).toHaveBeenCalledWith(expect.anything(), traceContext);
      expect(withSpy).toHaveBeenCalled();

      extractSpy.mockRestore();
      withSpy.mockRestore();
    });

    it('processes a PDF job through the pdf engine', async () => {
      const job = makeJob(pdfJobData);
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      screenshots.findBaselineByVariant.mockResolvedValue({
        id: 'baseline-1',
        imageUrl: 'http://storage/baseline.pdf',
      } as never);
      pdfEngine.compare.mockResolvedValue(pdfDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.pdf');

      await processor.processJob(job);

      expect(storage.get).toHaveBeenCalledWith('http://storage/baseline.pdf');
      expect(storage.get).toHaveBeenCalledWith('http://storage/candidate.pdf');
      expect(pdfEngine.compare).toHaveBeenCalledWith(
        Buffer.from('file-data'),
        Buffer.from('file-data'),
        { sizePolicy: 'FAIL' },
      );
    });

    it('throws when no engine found for kind', async () => {
      const customData = { ...imageJobData, testKind: 'image' as const };
      const job = makeJob(customData);
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      const tracker2 = createMock<Tracker>();
      tracker2.track.mockImplementation((_: string, fn: () => Promise<any>) =>
        fn(),
      );
      const module2 = await Test.createTestingModule({
        providers: [
          ComparisonJobProcessor,
          { provide: ComparisonRetirementService, useValue: retirement },
          { provide: CandidateReclamationService, useValue: reclamation },
          { provide: WebhookDispatchService, useValue: webhooks },
          { provide: ComparisonOutcomeService, useValue: outcomes },
          { provide: COMPARISON_ENGINES, useValue: {} },
          { provide: STORAGE_PROVIDER, useValue: storage },
          { provide: Tracker, useValue: tracker2 },
          { provide: UnifiedScreenshotRepository, useValue: screenshots },
          { provide: PrismaUnitOfWork, useValue: uow },
          { provide: AppLoggerService, useValue: createMockLogger() },
          {
            provide: TestStatusService,
            useValue: {
              recomputeStatus: vi.fn().mockResolvedValue(undefined),
            },
          },
          { provide: METRICS_RECORDER, useValue: metrics },
          StateChangeWorkflow,
        ],
      }).compile();
      const p = module2.get(ComparisonJobProcessor);

      await expect(p.processJob(job)).rejects.toThrow(DomainError);
      await expect(p.processJob(job)).rejects.toMatchObject({
        code: 'INVALID_STATE',
        message: 'No comparison engine for kind: image',
      });
    });
  });

  describe('within-threshold outcome', () => {
    function setBaselineThreshold(threshold: number | undefined): void {
      screenshots.findBaselineByVariant.mockResolvedValue({
        id: 'baseline-1',
        imageUrl: 'http://storage/baseline.png',
        pixelDiffThreshold: threshold,
      } as never);
    }

    it('auto-accepts a diff below the baseline threshold without storing a comparison or diff artifact', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      setBaselineThreshold(20);
      imageEngine.compare.mockResolvedValue({
        ...imageDiff,
        mismatchPixelCount: 15,
      });

      await processor.processJob(makeJob(imageJobData));

      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith(
        expect.objectContaining({
          testId: 'test-1',
          events: [
            expect.objectContaining({
              kind: 'comparison_completed',
              outcome: 'within_threshold',
              diffMetric: 15,
            }),
          ],
        }),
      );
      expect(retirement.createPendingForVariant).not.toHaveBeenCalled();
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(outcomes.record).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'within_threshold',
          mismatchMetric: 15,
        }),
      );
    });

    it('auto-accepts an exact boundary match', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      setBaselineThreshold(20);
      imageEngine.compare.mockResolvedValue({
        ...imageDiff,
        mismatchPixelCount: 20,
      });

      await processor.processJob(makeJob(imageJobData));

      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [expect.objectContaining({ outcome: 'within_threshold' })],
        }),
      );
      expect(retirement.createPendingForVariant).not.toHaveBeenCalled();
    });

    it('keeps a diff above the threshold reviewable', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      setBaselineThreshold(20);
      imageEngine.compare.mockResolvedValue({
        ...imageDiff,
        mismatchPixelCount: 21,
      });
      storage.putObject.mockResolvedValue('http://storage/diff.png');

      await processor.processJob(makeJob(imageJobData));

      expect(retirement.createPendingForVariant).toHaveBeenCalled();
      expect(storage.putObject).toHaveBeenCalled();
      expect(reclamation.reclaimCandidateInChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          events: [expect.objectContaining({ outcome: 'within_threshold' })],
        }),
      );
    });

    it('does not apply the threshold to PDF tests', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      screenshots.findBaselineByVariant.mockResolvedValue({
        id: 'baseline-1',
        imageUrl: 'http://storage/baseline.pdf',
        pixelDiffThreshold: 100,
      } as never);
      pdfEngine.compare.mockResolvedValue(pdfDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.pdf');

      await processor.processJob(makeJob(pdfJobData));

      expect(retirement.createPendingForVariant).toHaveBeenCalled();
      expect(storage.putObject).toHaveBeenCalled();
    });

    it('treats a missing threshold as zero, keeping legacy comparisons reviewable', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      setBaselineThreshold(undefined);
      imageEngine.compare.mockResolvedValue(imageDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.png');

      await processor.processJob(makeJob(imageJobData));

      expect(retirement.createPendingForVariant).toHaveBeenCalled();
      expect(storage.putObject).toHaveBeenCalled();
    });
  });

  describe('unchanged outcome', () => {
    it('delegates the reclaim to the retirement seam with an UNCHANGED event', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      imageEngine.compare.mockResolvedValue(imageUnchanged);

      await processor.processJob(makeJob(imageJobData));

      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith(
        expect.objectContaining({
          testId: 'test-1',
          events: [
            expect.objectContaining({
              kind: 'comparison_completed',
              outcome: 'unchanged',
            }),
          ],
        }),
      );
      expect(outcomes.record).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'unchanged', mismatchMetric: 0 }),
      );
    });

    it('resolves the candidate in-transaction by re-reading the current row', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      imageEngine.compare.mockResolvedValue(imageUnchanged);

      await processor.processJob(makeJob(imageJobData));

      const call = reclamation.reclaimCandidateInChange.mock.calls[0][0] as {
        resolveCandidate?: () => Promise<{ id: string }>;
      };
      await expect(call.resolveCandidate!()).resolves.toMatchObject({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
    });

    it('aborts the unchanged outcome when the current row no longer matches the job (superseded)', async () => {
      screenshots.findCurrentByVariant
        .mockResolvedValueOnce({
          id: 'candidate-1',
          imageHash: 'hash-from-upload',
        })
        .mockResolvedValueOnce(null);
      imageEngine.compare.mockResolvedValue(imageUnchanged);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).resolves.toBeUndefined();

      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith({
        testId: 'test-1',
        candidateId: 'candidate-1',
        expectedUrl: 'http://storage/candidate.png',
      });
      expect(completedEventLabels()).not.toContainEqual(
        expect.objectContaining({ event: 'comparison_completed' }),
      );
    });

    it('aborts the unchanged outcome when the baseline was replaced', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      screenshots.findBaselineByVariant
        .mockResolvedValueOnce({
          id: 'baseline-1',
          imageUrl: 'http://storage/baseline.png',
        } as never)
        .mockResolvedValueOnce({
          id: 'REPLACED-baseline',
        } as never);
      imageEngine.compare.mockResolvedValue(imageUnchanged);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).resolves.toBeUndefined();

      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith({
        testId: 'test-1',
        candidateId: 'candidate-1',
        expectedUrl: 'http://storage/candidate.png',
      });
      expect(completedEventLabels()).not.toContainEqual(
        expect.objectContaining({ event: 'comparison_completed' }),
      );
    });
  });

  describe('diff outcome', () => {
    it('creates an image comparison, cleans stale diffs, publishes event', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      imageEngine.compare.mockResolvedValue(imageDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.png');
      retirement.createPendingForVariant.mockResolvedValue({
        id: 'comp-1',
        staleUrls: ['http://storage/stale-diff.png'],
      });

      await processor.processJob(makeJob(imageJobData));

      expect(storage.putObject).toHaveBeenCalledWith(
        expect.stringMatching(/^hash-from-upload-[0-9a-f-]+\.diff\.png$/),
        imageDiff.diffOutput,
        'image/png',
      );
      expect(retirement.createPendingForVariant).toHaveBeenCalledWith({
        testId: 'test-1',
        variant: expect.any(Variant),
        baselineId: 'baseline-1',
        candidateId: 'candidate-1',
        diffUrl: 'http://storage/diff.png',
        result: imageDiff,
        diffSizeBytes: expect.any(Number),
        runId: 'run-1',
        runKey: 'ci-1',
      });
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/stale-diff.png',
      ]);
      expect(completedEventLabels()).toContainEqual(
        expect.objectContaining({ event: 'comparison_completed' }),
      );
      expect(webhooks.enqueueReviewRequested).toHaveBeenCalledWith({
        testId: 'test-1',
        comparisonId: 'comp-1',
        kind: 'image',
        variant: imageJobData.variant,
        mismatchPixelCount: 15,
      });
      expect(outcomes.record).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'changed',
          comparisonId: 'comp-1',
          testName: 'checkout',
        }),
      );
    });

    it('cleans up the diff file when persisting the comparison fails', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      imageEngine.compare.mockResolvedValue(imageDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.png');
      retirement.createPendingForVariant.mockRejectedValue(
        new Error('DB failure'),
      );
      storage.deleteQuietly.mockResolvedValue(undefined);

      await expect(processor.processJob(makeJob(imageJobData))).rejects.toThrow(
        'DB failure',
      );
      expect(storage.deleteQuietly).toHaveBeenCalledWith(
        'http://storage/diff.png',
      );
    });

    it('aborts a diff when the candidate was superseded by a newer upload', async () => {
      screenshots.findCurrentByVariant
        .mockResolvedValueOnce({
          id: 'candidate-1',
          imageHash: 'hash-from-upload',
        })
        .mockResolvedValueOnce({
          id: 'candidate-1',
          imageHash: 'DIFFERENT-HASH',
        });
      imageEngine.compare.mockResolvedValue(imageDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.png');
      storage.deleteQuietly.mockResolvedValue(undefined);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).resolves.toBeUndefined();

      expect(retirement.createPendingForVariant).not.toHaveBeenCalled();
      expect(storage.deleteQuietly).toHaveBeenCalledWith(
        'http://storage/diff.png',
      );
    });

    it('aborts a diff when the baseline was replaced in place (same id, new file url)', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      screenshots.findBaselineByVariant
        .mockResolvedValueOnce({
          id: 'baseline-1',
          imageUrl: 'http://storage/baseline.png',
        } as never)
        .mockResolvedValueOnce({
          id: 'baseline-1',
          imageUrl: 'http://storage/REPLACED-baseline.png',
        } as never);
      imageEngine.compare.mockResolvedValue(imageDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.png');
      storage.deleteQuietly.mockResolvedValue(undefined);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).resolves.toBeUndefined();

      expect(retirement.createPendingForVariant).not.toHaveBeenCalled();
      expect(storage.deleteQuietly).toHaveBeenCalledWith(
        'http://storage/diff.png',
      );
    });

    it('creates a pdf comparison without overwriting the screenshot page count', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      screenshots.findBaselineByVariant.mockResolvedValue({
        id: 'baseline-1',
        imageUrl: 'http://storage/baseline.pdf',
      } as never);
      pdfEngine.compare.mockResolvedValue(pdfDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.pdf');

      await processor.processJob(makeJob(pdfJobData));

      expect(storage.putObject).toHaveBeenCalledWith(
        expect.stringMatching(/^hash-from-upload-[0-9a-f-]+\.diff\.pdf$/),
        pdfDiff.diffOutput,
        'application/pdf',
      );
      expect(retirement.createPendingForVariant).toHaveBeenCalledWith({
        testId: 'test-1',
        variant: expect.any(Variant),
        baselineId: 'baseline-1',
        candidateId: 'candidate-1',
        diffUrl: 'http://storage/diff.pdf',
        result: pdfDiff,
        diffSizeBytes: expect.any(Number),
      });
      expect(completedEventLabels()).toContainEqual(
        expect.objectContaining({ event: 'comparison_completed' }),
      );
    });

    it('persists a zero sidecar page count on the pending comparison', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      screenshots.findBaselineByVariant.mockResolvedValue({
        id: 'baseline-1',
        imageUrl: 'http://storage/baseline.pdf',
      } as never);
      pdfEngine.compare.mockResolvedValue({
        kind: 'pdf',
        mismatchPageCount: 3,
        diffOutput: Buffer.from('diff-pdf-data'),
        pageCount: 0,
      });
      storage.putObject.mockResolvedValue('http://storage/diff.pdf');

      await processor.processJob(makeJob(pdfJobData));

      expect(retirement.createPendingForVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          diffUrl: 'http://storage/diff.pdf',
          result: expect.objectContaining({
            pageCount: 0,
          }),
        }),
      );
    });

    it('runs the diff change inside a retried Serializable transaction', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      imageEngine.compare.mockResolvedValue(imageDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.png');

      await processor.processJob(makeJob(imageJobData));

      expect(uow.execute).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: 'Serializable',
        }),
      );
    });
  });

  describe('mootness gate', () => {
    it('runs the gate before any download', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'DIFFERENT-HASH',
      });
      storage.get.mockResolvedValue(Buffer.from('candidate-data'));

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).resolves.toBeUndefined();

      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith({
        testId: 'test-1',
        candidateId: 'candidate-1',
        expectedUrl: 'http://storage/candidate.png',
      });
      expect(storage.get).not.toHaveBeenCalled();
    });

    it('retires the orphaned candidate when a diff is superseded mid-compare', async () => {
      screenshots.findCurrentByVariant
        .mockResolvedValueOnce({
          id: 'candidate-1',
          imageHash: 'hash-from-upload',
        })
        .mockResolvedValueOnce({
          id: 'candidate-1',
          imageHash: 'DIFFERENT-HASH',
        });
      imageEngine.compare.mockResolvedValue(imageDiff);
      storage.putObject.mockResolvedValue('http://storage/diff.png');
      storage.deleteQuietly.mockResolvedValue(undefined);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await processor.processJob(makeJob(imageJobData));

      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith({
        testId: 'test-1',
        candidateId: 'candidate-1',
        expectedUrl: 'http://storage/candidate.png',
      });
    });

    it('completes silently when the candidate object is missing (moot)', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      storage.get.mockRejectedValue(
        new DomainError('Object not found in storage', 'NOT_FOUND'),
      );

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).resolves.toBeUndefined();

      expect(storage.get).toHaveBeenCalledWith('http://storage/candidate.png');
      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith({
        testId: 'test-1',
        candidateId: 'candidate-1',
        expectedUrl: 'http://storage/candidate.png',
      });
    });

    it('fails the job when only the baseline object is missing (candidate still live)', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      storage.get
        .mockResolvedValueOnce(Buffer.from('candidate-data'))
        .mockRejectedValueOnce(
          new DomainError('Object not found in storage', 'NOT_FOUND'),
        );

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });

      expect(reclamation.reclaimCandidateInChange).not.toHaveBeenCalled();
    });

    it('retires as moot when the baseline object vanishes after a concurrent approval (gate re-run detects it)', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      screenshots.findBaselineByVariant
        .mockResolvedValueOnce({
          id: 'baseline-1',
          imageUrl: 'http://storage/baseline.png',
        } as never)
        .mockResolvedValueOnce({
          id: 'baseline-1',
          imageUrl: 'http://storage/REPLACED-baseline.png',
        } as never);
      storage.get
        .mockResolvedValueOnce(Buffer.from('candidate-data'))
        .mockRejectedValueOnce(
          new DomainError('Object not found in storage', 'NOT_FOUND'),
        );

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).resolves.toBeUndefined();

      expect(screenshots.findBaselineByVariant).toHaveBeenCalledTimes(2);
      expect(reclamation.reclaimCandidateInChange).toHaveBeenCalledWith({
        testId: 'test-1',
        candidateId: 'candidate-1',
        expectedUrl: 'http://storage/candidate.png',
      });
    });

    it('still fails for non-missing storage errors', async () => {
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'candidate-1',
        imageHash: 'hash-from-upload',
      });
      storage.get.mockRejectedValue(
        new DomainError('Storage down', 'INTERNAL_ERROR'),
      );

      await expect(
        processor.processJob(makeJob(imageJobData)),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });
  });
});
