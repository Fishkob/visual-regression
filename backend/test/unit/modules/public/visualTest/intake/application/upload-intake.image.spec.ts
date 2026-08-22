import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import {
  UploadIntake,
  uploadObjectName,
} from '@public/visualTest/intake/application/upload-intake.service';
import { UploadDecisionResolver } from '@public/visualTest/intake/application/upload-decision.resolver';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { JOB_PRODUCER, IJobProducer } from '@common/domain/job-queue.interface';
import { Tracker } from '@common/tracker/tracker.service';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { AppLoggerService } from '@common/logging/app-logger.service';
import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { PDF_PAGE_COUNTER } from '@common/domain/pdf-sidecar.interface';
import { createMock } from '@test/utils/create-mock';
import {
  createMockStorage,
  createMockUoW,
  createMockLogger,
} from '@test/utils/mocks';

describe('UploadIntake (image kind)', () => {
  let uploadIntake: UploadIntake;
  let tests: jest.Mocked<UnifiedTestRepository>;
  let screenshots: jest.Mocked<UnifiedScreenshotRepository>;
  let workflow: StateChangeWorkflow;
  let storage: jest.Mocked<IStorageProvider>;
  let jobQueue: jest.Mocked<IJobProducer>;
  let tracker: jest.Mocked<Tracker>;
  let statusService: jest.Mocked<TestStatusService>;
  let comparisons: jest.Mocked<UnifiedComparisonsRepository>;
  let retirement: jest.Mocked<ComparisonRetirementService>;
  let metrics: jest.Mocked<IMetricsRecorder>;

  const testBuffer = Buffer.from('test-image-content');
  const testHash = createHash('sha256').update(testBuffer).digest('hex');
  const differentBuffer = Buffer.from('different-content');
  const differentHash = createHash('sha256')
    .update(differentBuffer)
    .digest('hex');
  const testDate = 1700000000000;

  const baseParams = {
    projectName: 'test-project',
    testName: 'test-name',
    viewport: '1920x1080',
    browser: 'chromium',
    environment: 'staging',
    file: { buffer: testBuffer, mimetype: 'image/png' } as Express.Multer.File,
  };

  function emittedEventTypes(): string[] {
    return metrics.incrementCounter.mock.calls
      .filter(([name]) => name === 'domain_events_total')
      .map(([, labels]) => (labels as { event: string }).event);
  }

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(testDate);

    tests = createMock<UnifiedTestRepository>();
    tests.findByProjectNameAndTestName.mockResolvedValue({
      id: 'test-1',
      name: 'test-name',
      kind: 'image',
      createdAt: new Date(testDate),
    });
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.filterReclaimableUrls.mockImplementation((urls) =>
      Promise.resolve(urls),
    );
    storage = createMockStorage() as unknown as jest.Mocked<IStorageProvider>;
    storage.deleteQuietly.mockResolvedValue(undefined);
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });
    jobQueue = createMock<IJobProducer>();
    tracker = createMock<Tracker>();
    tracker.track.mockImplementation(
      (_name: string, fn: () => Promise<unknown>) => fn(),
    );
    statusService = createMock<TestStatusService>();
    comparisons = createMock<UnifiedComparisonsRepository>();
    retirement = createMock<ComparisonRetirementService>();
    retirement.supersedeForVariant.mockResolvedValue([]);
    retirement.supersedeIdenticalForVariant.mockResolvedValue([]);
    metrics = createMock<IMetricsRecorder>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadIntake,
        UploadDecisionResolver,
        { provide: UnifiedTestRepository, useValue: tests },
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: UnifiedComparisonsRepository, useValue: comparisons },
        { provide: ComparisonRetirementService, useValue: retirement },
        StateChangeWorkflow,
        {
          provide: PrismaUnitOfWork,
          useValue: createMockUoW() as unknown as jest.Mocked<PrismaUnitOfWork>,
        },
        { provide: AppLoggerService, useValue: createMockLogger() },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: JOB_PRODUCER, useValue: jobQueue },
        { provide: Tracker, useValue: tracker },
        { provide: TestStatusService, useValue: statusService },
        { provide: METRICS_RECORDER, useValue: metrics },
        { provide: PDF_PAGE_COUNTER, useValue: { count: jest.fn() } },
      ],
    }).compile();

    uploadIntake = module.get(UploadIntake);
    workflow = module.get(StateChangeWorkflow);
    jest.spyOn(workflow, 'executeStateChange');
    jest.spyOn(workflow, 'executeWithStoredFile');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an upload whose testKind does not match the file MIME type', async () => {
    await expect(
      uploadIntake.upload(
        {
          ...baseParams,
          file: { ...baseParams.file, mimetype: 'application/pdf' },
        },
        'image',
      ),
    ).rejects.toThrow(/does not match test kind "image"/);
    expect(tests.ensureTest).not.toHaveBeenCalled();
  });

  it('returns identical when hash matches baseline', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue({
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: testHash,
      pixelDiffThreshold: undefined,
    } as any);
    retirement.supersedeIdenticalForVariant.mockResolvedValue([
      'https://storage/old-diff.png',
    ]);

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'identical',
      mismatchPixelCount: 0,
    });
    expect(workflow.executeStateChange).toHaveBeenCalled();
    expect(emittedEventTypes()).toEqual([]);
    expect(tracker.track).toHaveBeenCalledWith(
      'unified_upload_intake',
      expect.any(Function),
    );
  });

  it('retires stale comparisons and cancels queued jobs on identical upload', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue({
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: testHash,
      pixelDiffThreshold: undefined,
    } as any);
    retirement.supersedeIdenticalForVariant.mockResolvedValue([
      'https://storage/old-diff.png',
    ]);

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'identical',
      mismatchPixelCount: 0,
    });
    expect(retirement.supersedeIdenticalForVariant).toHaveBeenCalledWith(
      'test-1',
      expect.objectContaining({
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      }),
    );
    expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'https://storage/old-diff.png',
    ]);
  });

  it('does not resurrect a deleted test from the identical gate transaction', async () => {
    tests.findByProjectNameAndTestName
      .mockResolvedValueOnce({
        id: 'test-1',
        name: 'test-name',
        kind: 'image',
        createdAt: new Date(testDate),
      })
      .mockResolvedValueOnce(null);
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant
      .mockResolvedValueOnce({
        id: 'base-1',
        imageUrl: 'https://storage/baseline.png',
        imageHash: testHash,
        pixelDiffThreshold: undefined,
      } as any)
      .mockResolvedValue(null);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'baseline_created',
      testId: 'test-1',
      fileUrl: `https://storage/${testHash}-${testDate}.png`,
    });
    // ensureTest must run only in the stored path — the identical gate
    // transaction re-resolves read-only, so a test deleted between the gate
    // and the transaction is not re-created as a side effect of a noop.
    expect(tests.ensureTest).toHaveBeenCalledTimes(1);
  });

  it('falls through to the stored path when the identical decision changes inside the transaction', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    const identicalBaseline = {
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: testHash,
      pixelDiffThreshold: 0.5,
    } as any;
    const changedBaseline = {
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: differentHash,
      pixelDiffThreshold: 0.5,
    } as any;
    screenshots.findBaselineByVariant
      .mockResolvedValueOnce(identicalBaseline)
      .mockResolvedValueOnce(changedBaseline)
      .mockResolvedValueOnce(changedBaseline)
      .mockResolvedValueOnce(changedBaseline);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    retirement.supersedeForVariant.mockResolvedValue([]);
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
    } as any);

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'comparison_queued',
      error: ComparisonErrorCode.IMAGE_DIFFERENCE,
      message: 'Comparison queued — check test results.',
    });
    expect(workflow.executeWithStoredFile).toHaveBeenCalled();
    expect(screenshots.upsertCandidateForVariant).toHaveBeenCalledTimes(1);
  });

  it('re-evaluates a re-appearing identical baseline inside the stored transaction instead of trusting the out-of-transaction resolve', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    const identicalBaseline = {
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: testHash,
      pixelDiffThreshold: 0.5,
    } as any;
    const changedBaseline = {
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: differentHash,
      pixelDiffThreshold: 0.5,
    } as any;
    screenshots.findBaselineByVariant
      .mockResolvedValueOnce(identicalBaseline)
      .mockResolvedValueOnce(changedBaseline)
      .mockResolvedValueOnce(identicalBaseline);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    retirement.supersedeIdenticalForVariant.mockResolvedValue([
      'https://storage/stale-diff.png',
    ]);

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'identical',
      mismatchPixelCount: 0,
    });
    expect(workflow.executeWithStoredFile).toHaveBeenCalled();
    expect(storage.deleteQuietly).not.toHaveBeenCalled();
    expect(storage.deleteAll).toHaveBeenCalledWith([
      `https://storage/${testHash}-${testDate}.png`,
      'https://storage/stale-diff.png',
    ]);
  });

  it('creates baseline when no existing baseline', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(null);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'baseline_created',
      testId: 'test-1',
      fileUrl: `https://storage/${testHash}-${testDate}.png`,
    });
    expect(workflow.executeWithStoredFile).toHaveBeenCalledWith(
      expect.objectContaining({
        store: expect.any(Function),
        change: expect.any(Function),
      }),
    );
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'domain_events_total',
      {
        event: 'screenshot_uploaded',
        type: 'BASELINE',
        status: '',
      },
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${testHash}-.+\\.png$`)),
      testBuffer,
      'image/png',
    );
    expect(screenshots.upsertBaselineForVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: 'test-1',
        contentHash: testHash,
        contentUrl: `https://storage/${testHash}-${testDate}.png`,
      }),
    );
    expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
    expect(storage.deleteQuietly).not.toHaveBeenCalled();
  });

  it('cleans up uploaded file when upsertBaseline fails', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(null);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    const dbError = new Error('DB failure');
    screenshots.upsertBaselineForVariant.mockRejectedValue(dbError);

    await expect(uploadIntake.upload(baseParams, 'image')).rejects.toThrow(
      dbError,
    );

    expect(storage.deleteQuietly).toHaveBeenCalledWith(
      `https://storage/${testHash}-${testDate}.png`,
    );
  });

  it('queues comparison when hash differs from baseline', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue({
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: differentHash,
      pixelDiffThreshold: 0.5,
    } as any);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    retirement.supersedeForVariant.mockResolvedValue([
      'https://storage/old-diff-1.png',
      'https://storage/old-diff-2.png',
    ]);
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
    } as any);

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'comparison_queued',
      error: ComparisonErrorCode.IMAGE_DIFFERENCE,
      message: 'Comparison queued — check test results.',
    });
    expect(screenshots.upsertCandidateForVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: 'test-1',
        contentHash: testHash,
        contentUrl: `https://storage/${testHash}-${testDate}.png`,
        variant: expect.objectContaining({
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
        }),
      }),
    );
    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        testKind: 'image',
        testId: 'test-1',
        candidate: {
          id: 'candidate-1',
          url: `https://storage/${testHash}-${testDate}.png`,
        },
        baseline: {
          id: 'base-1',
          url: 'https://storage/baseline.png',
        },
        variant: {
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
        },
      }),
    );
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'https://storage/old-diff-1.png',
      'https://storage/old-diff-2.png',
    ]);
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'domain_events_total',
      {
        event: 'screenshot_uploaded',
        type: 'CURRENT',
        status: '',
      },
    );
    expect(retirement.supersedeForVariant).toHaveBeenCalledWith(
      'test-1',
      expect.objectContaining({
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      }),
    );
    expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
  });

  it('cleans up the replaced candidate file when a current row already exists', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue({
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: differentHash,
      pixelDiffThreshold: 0.5,
    } as any);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    retirement.supersedeForVariant.mockResolvedValue([
      'https://storage/retired.png',
    ]);
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
      replacedUrl: 'https://storage/old-candidate.png',
    } as any);

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result.status).toBe('comparison_queued');
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'https://storage/retired.png',
      'https://storage/old-candidate.png',
    ]);
  });

  it('cancels stale pending jobs before enqueueing a new comparison', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue({
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: differentHash,
      pixelDiffThreshold: 0.5,
    } as any);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    retirement.supersedeForVariant.mockResolvedValue([]);
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
    } as any);

    await uploadIntake.upload(baseParams, 'image');

    expect(retirement.supersedeForVariant).toHaveBeenCalledWith(
      'test-1',
      expect.any(Object),
    );
    expect(
      retirement.supersedeForVariant.mock.invocationCallOrder[0],
    ).toBeLessThan(jobQueue.enqueue.mock.invocationCallOrder[0]);
  });

  it('cleans up candidate file when enqueue fails', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue({
      id: 'base-1',
      imageUrl: 'https://storage/baseline.png',
      imageHash: differentHash,
      pixelDiffThreshold: 0.5,
    } as any);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    retirement.supersedeForVariant.mockResolvedValue([]);
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
    } as any);
    const enqueueError = new Error('Queue full');
    jobQueue.enqueue.mockRejectedValue(enqueueError);

    await expect(uploadIntake.upload(baseParams, 'image')).rejects.toThrow(
      enqueueError,
    );

    expect(storage.deleteQuietly).toHaveBeenCalledWith(
      `https://storage/${testHash}-${testDate}.png`,
    );
    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('re-resolves inside the transaction when a baseline appears mid-upload', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'base-1',
        imageUrl: 'https://storage/baseline.png',
        imageHash: differentHash,
        pixelDiffThreshold: 0.5,
      } as any);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    retirement.supersedeForVariant.mockResolvedValue([]);
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
    } as any);

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'comparison_queued',
      error: ComparisonErrorCode.IMAGE_DIFFERENCE,
      message: 'Comparison queued — check test results.',
    });
    expect(screenshots.findBaselineByVariant).toHaveBeenCalledTimes(2);
    expect(screenshots.upsertBaselineForVariant).not.toHaveBeenCalled();
    expect(screenshots.upsertCandidateForVariant).toHaveBeenCalledTimes(1);
    expect(jobQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'domain_events_total',
      {
        event: 'screenshot_uploaded',
        type: 'CURRENT',
        status: '',
      },
    );
  });

  it('discards the stored file when the in-transaction resolve becomes identical', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
    screenshots.findBaselineByVariant
      .mockResolvedValueOnce({
        id: 'base-1',
        imageUrl: 'https://storage/baseline.png',
        imageHash: differentHash,
        pixelDiffThreshold: 0.5,
      } as any)
      .mockResolvedValueOnce({
        id: 'base-1',
        imageUrl: 'https://storage/baseline.png',
        imageHash: testHash,
        pixelDiffThreshold: 0.5,
      } as any);
    storage.putObject.mockResolvedValue(
      `https://storage/${testHash}-${testDate}.png`,
    );
    retirement.supersedeIdenticalForVariant.mockResolvedValue([
      'https://storage/stale-diff.png',
    ]);

    const result = await uploadIntake.upload(baseParams, 'image');

    expect(result).toEqual({
      status: 'identical',
      mismatchPixelCount: 0,
    });
    expect(retirement.supersedeIdenticalForVariant).toHaveBeenCalledTimes(1);
    expect(storage.deleteQuietly).not.toHaveBeenCalled();
    expect(storage.deleteAll).toHaveBeenCalledWith([
      `https://storage/${testHash}-${testDate}.png`,
      'https://storage/stale-diff.png',
    ]);
    expect(emittedEventTypes()).toEqual([]);
  });

  describe('uploadObjectName uniqueness', () => {
    it('produces a unique object name per upload even for identical content and clock', () => {
      const first = uploadObjectName('image', testHash);
      const second = uploadObjectName('image', testHash);

      expect(first).toMatch(new RegExp(`^${testHash}-.+\\.png$`));
      expect(second).toMatch(new RegExp(`^${testHash}-.+\\.png$`));
      expect(first).not.toBe(second);
    });
  });
});
