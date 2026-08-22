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
import { ComparisonErrorCode } from '@public/visualTest/core/domain/types/visual-test.types';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { ScreenshotType } from '@public/visualTest/core/domain/types/visual-test.types';
import { Prisma } from '@/prisma/client';
import {
  PDF_PAGE_COUNTER,
  IPdfPageCounter,
} from '@common/domain/pdf-sidecar.interface';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import {
  createMockStorage,
  createMockUoW,
  createMockLogger,
} from '@test/utils/mocks';

describe('UploadIntake (pdf kind)', () => {
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

  const testPdfBuffer = Buffer.from('test-pdf-content');
  const testPdfHash = createHash('sha256').update(testPdfBuffer).digest('hex');
  const differentPdfBuffer = Buffer.from('different-pdf-content');
  const differentPdfHash = createHash('sha256')
    .update(differentPdfBuffer)
    .digest('hex');

  const baseParams = {
    projectName: 'test-project',
    testName: 'test-name',
    viewport: '1920x1080',
    browser: 'chromium',
    environment: 'staging',
    file: {
      buffer: testPdfBuffer,
      mimetype: 'application/pdf',
    } as Express.Multer.File,
  };

  function pdfBaselineEntity(): ScreenshotEntity {
    return new ScreenshotEntity({
      id: 'pdf-base-1',
      visualTestId: 'pdf-test-1',
      type: ScreenshotType.BASELINE,
      imageHash: testPdfHash,
      imageUrl: 'https://storage/baseline.pdf',
      variant: Variant.fromStrings('1920x1080', 'chromium', 'staging'),
      createdAt: new Date('2024-01-01'),
      pixelDiffThreshold: 0,
    });
  }

  beforeEach(async () => {
    tests = createMock<UnifiedTestRepository>();
    tests.findByProjectNameAndTestName.mockResolvedValue({
      id: 'pdf-test-1',
      name: 'test-name',
      kind: 'pdf',
      createdAt: new Date('2024-01-01'),
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
    const pageCounter = {
      count: jest.fn().mockResolvedValue(3),
    } as unknown as jest.Mocked<IPdfPageCounter>;

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
        { provide: PDF_PAGE_COUNTER, useValue: pageCounter },
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
          file: { ...baseParams.file, mimetype: 'image/png' },
        },
        'pdf',
      ),
    ).rejects.toThrow(/does not match test kind "pdf"/);
    expect(tests.ensureTest).not.toHaveBeenCalled();
  });

  it('returns identical when hash matches pdf baseline', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(pdfBaselineEntity());
    retirement.supersedeIdenticalForVariant.mockResolvedValue([
      'https://storage/old-diff.pdf',
    ]);

    const result = await uploadIntake.upload(baseParams, 'pdf');

    expect(result).toEqual({
      status: 'identical',
      mismatchPixelCount: 0,
    });
    expect(workflow.executeStateChange).toHaveBeenCalled();
    expect(retirement.supersedeIdenticalForVariant).toHaveBeenCalledWith(
      'pdf-test-1',
      expect.objectContaining({
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      }),
    );
    expect(statusService.recomputeStatus).toHaveBeenCalledWith('pdf-test-1');
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'https://storage/old-diff.pdf',
    ]);
  });

  it('creates pdf baseline when no existing baseline', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(null);
    storage.putObject.mockResolvedValue(`https://storage/${testPdfHash}.pdf`);

    const result = await uploadIntake.upload(baseParams, 'pdf');

    expect(result).toEqual({
      status: 'baseline_created',
      testId: 'pdf-test-1',
      fileUrl: `https://storage/${testPdfHash}.pdf`,
    });
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'domain_events_total',
      {
        event: 'screenshot_uploaded',
        type: 'BASELINE',
        status: '',
      },
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${testPdfHash}-.+\\.pdf$`)),
      testPdfBuffer,
      'application/pdf',
    );
    expect(screenshots.upsertBaselineForVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: 'pdf-test-1',
        contentHash: testPdfHash,
        contentUrl: `https://storage/${testPdfHash}.pdf`,
        variant: expect.objectContaining({
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
        }),
        pageCount: 3,
      }),
    );
    expect(statusService.recomputeStatus).toHaveBeenCalledWith('pdf-test-1');
  });

  it('queues pdf comparison when hash differs and no stale pending', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(pdfBaselineEntity());
    retirement.supersedeForVariant.mockResolvedValue([]);
    storage.putObject.mockResolvedValue(
      `https://storage/${differentPdfHash}.pdf`,
    );
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
      replacedUrl: null,
    });

    const result = await uploadIntake.upload(
      {
        ...baseParams,
        file: {
          buffer: differentPdfBuffer,
          mimetype: 'application/pdf',
        } as Express.Multer.File,
      },
      'pdf',
    );

    expect(result).toEqual({
      status: 'comparison_queued',
      error: ComparisonErrorCode.PDF_DIFFERENCE,
      message: 'PDF comparison queued — check test results.',
    });
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'domain_events_total',
      {
        event: 'screenshot_uploaded',
        type: 'CURRENT',
        status: '',
      },
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${differentPdfHash}-.+\\.pdf$`)),
      differentPdfBuffer,
      'application/pdf',
    );
    expect(screenshots.upsertCandidateForVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: 'pdf-test-1',
        contentHash: differentPdfHash,
        contentUrl: `https://storage/${differentPdfHash}.pdf`,
        variant: expect.objectContaining({
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
        }),
        pageCount: 3,
      }),
    );
    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        testKind: 'pdf',
        testId: 'pdf-test-1',
        candidate: {
          id: 'candidate-1',
          url: `https://storage/${differentPdfHash}.pdf`,
        },
        baseline: {
          id: 'pdf-base-1',
          url: 'https://storage/baseline.pdf',
        },
        variant: {
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
        },
      }),
    );
    const enqueued = jobQueue.enqueue.mock.calls[0][0] as unknown as Record<
      string,
      unknown
    >;
    expect(enqueued).not.toHaveProperty('threshold');
    expect(retirement.supersedeForVariant).toHaveBeenCalledWith(
      'pdf-test-1',
      expect.any(Variant),
    );
    expect(statusService.recomputeStatus).toHaveBeenCalledWith('pdf-test-1');
  });

  it('cancels stale pending jobs before enqueueing a new comparison', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(pdfBaselineEntity());
    retirement.supersedeForVariant.mockResolvedValue([]);
    storage.putObject.mockResolvedValue(
      `https://storage/${differentPdfHash}.pdf`,
    );
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
      replacedUrl: null,
    });

    await uploadIntake.upload(
      {
        ...baseParams,
        file: {
          buffer: differentPdfBuffer,
          mimetype: 'application/pdf',
        } as Express.Multer.File,
      },
      'pdf',
    );

    expect(retirement.supersedeForVariant).toHaveBeenCalledWith(
      'pdf-test-1',
      expect.any(Object),
    );
    expect(
      retirement.supersedeForVariant.mock.invocationCallOrder[0],
    ).toBeLessThan(jobQueue.enqueue.mock.invocationCallOrder[0]);
  });

  it('cleans up stale pending comparison when present', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(pdfBaselineEntity());
    retirement.supersedeForVariant.mockResolvedValue([
      'https://storage/stale-candidate.pdf',
      'https://storage/stale-diff.pdf',
    ]);
    storage.putObject.mockResolvedValue(
      `https://storage/${differentPdfHash}.pdf`,
    );
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
      replacedUrl: null,
    });

    const result = await uploadIntake.upload(
      {
        ...baseParams,
        file: {
          buffer: differentPdfBuffer,
          mimetype: 'application/pdf',
        } as Express.Multer.File,
      },
      'pdf',
    );

    expect(result).toEqual({
      status: 'comparison_queued',
      error: ComparisonErrorCode.PDF_DIFFERENCE,
      message: 'PDF comparison queued — check test results.',
    });
    expect(retirement.supersedeForVariant).toHaveBeenCalledWith(
      'pdf-test-1',
      expect.any(Variant),
    );
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'https://storage/stale-candidate.pdf',
      'https://storage/stale-diff.pdf',
    ]);
  });

  it('preserves the stale pending comparison when enqueue fails', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(pdfBaselineEntity());
    retirement.supersedeForVariant.mockResolvedValue([
      'https://storage/stale-candidate.pdf',
      'https://storage/stale-diff.pdf',
    ]);
    storage.putObject.mockResolvedValue(
      `https://storage/${differentPdfHash}.pdf`,
    );
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
      replacedUrl: null,
    });
    const enqueueError = new Error('Queue unavailable');
    jobQueue.enqueue.mockRejectedValue(enqueueError);

    await expect(
      uploadIntake.upload(
        {
          ...baseParams,
          file: {
            buffer: differentPdfBuffer,
            mimetype: 'application/pdf',
          } as Express.Multer.File,
        },
        'pdf',
      ),
    ).rejects.toThrow(enqueueError);

    expect(storage.deleteQuietly).toHaveBeenCalledWith(
      `https://storage/${differentPdfHash}.pdf`,
    );
    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('preserves the stale pending comparison when storage upload fails', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });
    screenshots.findBaselineByVariant.mockResolvedValue(pdfBaselineEntity());
    retirement.supersedeForVariant.mockResolvedValue([
      'https://storage/stale-candidate.pdf',
      'https://storage/stale-diff.pdf',
    ]);
    const uploadError = new Error('Storage unavailable');
    storage.putObject.mockRejectedValue(uploadError);

    await expect(
      uploadIntake.upload(
        {
          ...baseParams,
          file: {
            buffer: differentPdfBuffer,
            mimetype: 'application/pdf',
          } as Express.Multer.File,
        },
        'pdf',
      ),
    ).rejects.toThrow(uploadError);

    expect(retirement.supersedeForVariant).not.toHaveBeenCalled();
    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('does not leak stale urls between concurrent uploads', async () => {
    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });

    let releaseBResolve!: () => void;
    const bGate = new Promise<void>((resolve) => {
      releaseBResolve = resolve;
    });
    let releaseAUpload!: () => void;
    const aGate = new Promise<void>((resolve) => {
      releaseAUpload = resolve;
    });

    screenshots.findBaselineByVariant.mockImplementation(
      async (_testId: string, variant: Variant) => {
        if (variant.viewport === '1280x720') {
          await bGate;
        }
        return pdfBaselineEntity();
      },
    );

    retirement.supersedeForVariant.mockImplementation(
      async (_testId: string, variant?: Variant) => {
        const suffix = variant?.viewport === '1920x1080' ? 'A' : 'B';
        return [
          `https://storage/stale-${suffix}.pdf`,
          `https://storage/stale-${suffix}-diff.pdf`,
        ];
      },
    );

    let uploadCallCount = 0;
    storage.putObject.mockImplementation((name: string) => {
      uploadCallCount += 1;
      if (uploadCallCount === 1) {
        return aGate.then(() => Promise.resolve(`https://storage/${name}`));
      }
      return Promise.resolve(`https://storage/${name}`);
    });
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
      replacedUrl: null,
    });

    const uploadA = uploadIntake.upload(
      {
        ...baseParams,
        file: {
          buffer: differentPdfBuffer,
          mimetype: 'application/pdf',
        } as Express.Multer.File,
      },
      'pdf',
    );
    const uploadB = uploadIntake.upload(
      {
        ...baseParams,
        viewport: '1280x720',
        file: {
          buffer: differentPdfBuffer,
          mimetype: 'application/pdf',
        } as Express.Multer.File,
      },
      'pdf',
    );

    await Promise.resolve();
    releaseBResolve();
    await uploadB;

    releaseAUpload();
    await uploadA;

    const countDeletes = (url: string) =>
      storage.deleteAll.mock.calls.filter(([urls]) =>
        (urls as string[]).includes(url),
      ).length;

    expect(countDeletes('https://storage/stale-A.pdf')).toBe(1);
    expect(countDeletes('https://storage/stale-A-diff.pdf')).toBe(1);
    expect(countDeletes('https://storage/stale-B.pdf')).toBe(1);
    expect(countDeletes('https://storage/stale-B-diff.pdf')).toBe(1);
  });

  it('retries the decision and write on Prisma P2034 serialization failure', async () => {
    const p2034Error = new Prisma.PrismaClientKnownRequestError(
      'Transaction failed',
      { code: 'P2034', clientVersion: '7.8.0' },
    );

    tests.ensureTest.mockResolvedValue({ testId: 'pdf-test-1' });
    retirement.supersedeForVariant.mockResolvedValue([]);
    storage.putObject.mockResolvedValue(
      `https://storage/${differentPdfHash}.pdf`,
    );
    screenshots.upsertCandidateForVariant.mockResolvedValue({
      id: 'candidate-1',
      replacedUrl: null,
    });
    screenshots.findBaselineByVariant
      .mockResolvedValueOnce(pdfBaselineEntity())
      .mockRejectedValueOnce(p2034Error)
      .mockRejectedValueOnce(p2034Error)
      .mockResolvedValueOnce(pdfBaselineEntity());

    const result = await uploadIntake.upload(
      {
        ...baseParams,
        file: {
          buffer: differentPdfBuffer,
          mimetype: 'application/pdf',
        } as Express.Multer.File,
      },
      'pdf',
    );

    expect(result).toEqual({
      status: 'comparison_queued',
      error: ComparisonErrorCode.PDF_DIFFERENCE,
      message: 'PDF comparison queued — check test results.',
    });
    expect(screenshots.findBaselineByVariant).toHaveBeenCalledTimes(4);
    expect(screenshots.upsertCandidateForVariant).toHaveBeenCalledTimes(1);
    expect(storage.deleteQuietly).not.toHaveBeenCalled();
  });

  describe('uploadObjectName uniqueness', () => {
    it('produces a unique object name per upload even for identical content', () => {
      const first = uploadObjectName('pdf', testPdfHash);
      const second = uploadObjectName('pdf', testPdfHash);

      expect(first).toMatch(new RegExp(`^${testPdfHash}-.+\\.pdf$`));
      expect(second).toMatch(new RegExp(`^${testPdfHash}-.+\\.pdf$`));
      expect(first).not.toBe(second);
    });
  });
});
