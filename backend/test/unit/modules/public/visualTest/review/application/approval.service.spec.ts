import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainError } from '@common/domain/domain-error';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { Tracker } from '@common/tracker/tracker.service';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonStatus,
  ScreenshotType,
} from '@public/visualTest/core/domain/types/visual-test.types';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import {
  PDF_RENDER_CACHE,
  IPdfRenderCache,
} from '@common/domain/pdf-sidecar.interface';
import { createMock } from '@test/utils/create-mock';
import {
  createMockUoW,
  createMockStorage,
  createMockLogger,
} from '@test/utils/mocks';
import { AppLoggerService } from '@common/logging/app-logger.service';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let statusService: Mocked<TestStatusService>;
  let testResolver: Mocked<TestResolver>;
  let metrics: Mocked<IMetricsRecorder>;
  let storage: Mocked<IStorageProvider>;
  let uow: Mocked<PrismaUnitOfWork>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let retirement: Mocked<ComparisonRetirementService>;
  let pdfRenderCache: Mocked<IPdfRenderCache>;

  const imageTest = { id: 'test-1', name: 'my-test', kind: 'image' as const };
  const pdfTest = { id: 'test-1', name: 'my-test', kind: 'pdf' as const };
  const variant = Variant.fromStrings('1920x1080', 'chrome', 'staging');

  function makeBaseline(overrides = {}) {
    return new ScreenshotEntity({
      id: 'baseline-1',
      visualTestId: 'test-1',
      type: ScreenshotType.BASELINE,
      imageHash: 'old-hash',
      imageUrl: 'http://storage/baseline.png',
      variant,
      createdAt: new Date('2024-01-01'),
      pixelDiffThreshold: 0,
      ...overrides,
    });
  }

  function makeCandidate(overrides = {}) {
    return new ScreenshotEntity({
      id: 'candidate-1',
      visualTestId: 'test-1',
      type: ScreenshotType.CURRENT,
      imageHash: 'new-hash',
      imageUrl: 'http://storage/candidate.png',
      variant,
      createdAt: new Date('2024-01-02'),
      pixelDiffThreshold: 0,
      ...overrides,
    });
  }

  function makeComparison(
    baseline: ScreenshotEntity,
    candidate: ScreenshotEntity,
    overrides = {},
  ) {
    return new ComparisonEntity({
      id: 'comp-1',
      visualTestId: 'test-1',
      mismatchPixelCount: 10,
      diffImageUrl: 'http://storage/diff.png',
      status: ComparisonStatus.PENDING_APPROVAL,
      baselineId: baseline.id,
      candidateId: candidate.id,
      createdAt: new Date(),
      baseline,
      candidate,
      ...overrides,
    });
  }

  function makePdfComparison() {
    const baseline = new ScreenshotEntity({
      id: 'pdf-baseline-1',
      visualTestId: 'test-1',
      type: ScreenshotType.BASELINE,
      imageHash: 'old-pdf-hash',
      imageUrl: 'http://storage/pdf-baseline.png',
      variant,
      createdAt: new Date('2024-01-01'),
      pixelDiffThreshold: 0,
      pageCount: 5,
    });
    const candidate = new ScreenshotEntity({
      id: 'pdf-candidate-1',
      visualTestId: 'test-1',
      type: ScreenshotType.CURRENT,
      imageHash: 'new-pdf-hash',
      imageUrl: 'http://storage/pdf-candidate.png',
      variant,
      createdAt: new Date('2024-01-02'),
      pixelDiffThreshold: 0,
      pageCount: 5,
    });
    return new ComparisonEntity({
      id: 'pdf-comp-1',
      visualTestId: 'test-1',
      mismatchPixelCount: 0,
      diffImageUrl: null,
      status: ComparisonStatus.PENDING_APPROVAL,
      baselineId: baseline.id,
      candidateId: candidate.id,
      createdAt: new Date(),
      baseline,
      candidate,
    });
  }

  beforeEach(async () => {
    statusService = createMock<TestStatusService>();
    testResolver = createMock<TestResolver>();
    metrics = createMock<IMetricsRecorder>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.filterReclaimableUrls.mockImplementation((urls) =>
      Promise.resolve(urls),
    );
    comparisons = createMock<UnifiedComparisonsRepository>();
    comparisons.completeImageApproval.mockResolvedValue([]);
    comparisons.completePdfApproval.mockResolvedValue([]);
    retirement = createMock<ComparisonRetirementService>();
    retirement.retireSiblingsAndDeleteCandidate.mockResolvedValue([]);
    pdfRenderCache = createMock<IPdfRenderCache>();
    const tracker = createMock<Tracker>();
    tracker.track.mockImplementation((_: string, fn: () => Promise<any>) =>
      fn(),
    );
    const uowLocal = createMockUoW() as unknown as Mocked<PrismaUnitOfWork>;
    uow = uowLocal;
    storage = createMockStorage() as unknown as Mocked<IStorageProvider>;
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: TestResolver, useValue: testResolver },
        { provide: TestStatusService, useValue: statusService },
        { provide: PrismaUnitOfWork, useValue: uowLocal },
        StateChangeWorkflow,
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: Tracker, useValue: tracker },
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: UnifiedComparisonsRepository, useValue: comparisons },
        { provide: ComparisonRetirementService, useValue: retirement },
        { provide: PDF_RENDER_CACHE, useValue: pdfRenderCache },
        { provide: AppLoggerService, useValue: createMockLogger() },
        { provide: METRICS_RECORDER, useValue: metrics },
      ],
    }).compile();

    service = module.get(ApprovalService);
    uow = uowLocal;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('approveImage', () => {
    function mockResolvedTest() {
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
    }

    it('approves an image test and returns new baseline url', async () => {
      const baseline = makeBaseline();
      const candidate = makeCandidate();
      const comparison = makeComparison(baseline, candidate);

      mockResolvedTest();
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      comparisons.completeImageApproval.mockResolvedValue([
        'http://storage/diff.png',
      ]);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      const result = await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
      );

      expect(testResolver.findTestOfKind).toHaveBeenCalledWith(
        'my-project',
        'my-test',
        'image',
      );
      expect(comparisons.findByIdForTest).toHaveBeenCalledWith(
        'test-1',
        'comp-1',
      );
      expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
      expect(comparisons.completeImageApproval).toHaveBeenCalledWith(
        'test-1',
        'comp-1',
      );
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/baseline.png',
        'http://storage/diff.png',
      ]);
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'domain_events_total',
        expect.objectContaining({ event: 'comparison_approved' }),
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'domain_events_total',
        expect.objectContaining({ event: 'baseline_updated' }),
      );

      expect(result).toEqual({
        approved: true as const,
        newBaselineUrl: 'http://storage/candidate.png',
      });
    });

    it('executes the approval in a retried Serializable transaction like the upload path', async () => {
      const baseline = makeBaseline();
      const candidate = makeCandidate();
      const comparison = makeComparison(baseline, candidate);

      mockResolvedTest();
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage('my-project', 'my-test', 'comp-1');

      expect(uow.execute).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: 'Serializable',
        }),
      );
    });

    it('throws when project not found', async () => {
      testResolver.findTestOfKind.mockRejectedValue(
        new DomainError('Project "my-project" not found', 'NOT_FOUND'),
      );
      await expect(
        service.approveImage('my-project', 'my-test', 'comp-1'),
      ).rejects.toThrow(DomainError);
    });

    it('throws when comparison is not found', async () => {
      mockResolvedTest();
      comparisons.findByIdForTest.mockResolvedValue(null);
      await expect(
        service.approveImage('my-project', 'my-test', 'comp-1'),
      ).rejects.toThrow(DomainError);
    });

    it('throws when comparison is no longer pending', async () => {
      mockResolvedTest();
      comparisons.findByIdForTest.mockResolvedValue(
        new ComparisonEntity({
          id: 'comp-1',
          visualTestId: 'test-1',
          mismatchPixelCount: 10,
          diffImageUrl: 'http://storage/diff.png',
          status: ComparisonStatus.APPROVED,
          baselineId: 'baseline-1',
          candidateId: 'candidate-1',
          createdAt: new Date(),
        }),
      );
      await expect(
        service.approveImage('my-project', 'my-test', 'comp-1'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('throws when comparison missing baseline', async () => {
      mockResolvedTest();
      const comparison = makeComparison(makeBaseline(), makeCandidate()) as any;
      comparison.baseline = null;
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      await expect(
        service.approveImage('my-project', 'my-test', 'comp-1'),
      ).rejects.toThrow(DomainError);
    });

    it('throws when comparison missing candidate', async () => {
      mockResolvedTest();
      const comparison = makeComparison(makeBaseline(), makeCandidate()) as any;
      comparison.candidate = null;
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      await expect(
        service.approveImage('my-project', 'my-test', 'comp-1'),
      ).rejects.toThrow(DomainError);
    });

    it('rejects approving a PDF test through the image endpoint', async () => {
      testResolver.findTestOfKind.mockRejectedValue(
        new DomainError('Test "my-test" is not an image test', 'BAD_REQUEST'),
      );

      await expect(
        service.approveImage('my-project', 'my-test', 'comp-1'),
      ).rejects.toThrow(/not an image test/);
      expect(comparisons.findByIdForTest).not.toHaveBeenCalled();
      expect(comparisons.completeImageApproval).not.toHaveBeenCalled();
    });

    it('updates baseline, deletes comparison, retires others and returns stale urls', async () => {
      mockResolvedTest();
      const comparison = makeComparison(makeBaseline(), makeCandidate());
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      comparisons.completeImageApproval.mockResolvedValue([
        'http://storage/diff.png',
      ]);
      retirement.retireSiblingsAndDeleteCandidate.mockResolvedValue([
        'http://storage/stale-diff.png',
      ]);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage('my-project', 'my-test', 'comp-1');

      expect(screenshots.updateBaselineScreenshot).toHaveBeenCalledWith(
        'baseline-1',
        {
          imageHash: 'new-hash',
          imageUrl: 'http://storage/candidate.png',
        },
      );
      expect(comparisons.completeImageApproval).toHaveBeenCalledWith(
        'test-1',
        'comp-1',
      );
      expect(retirement.retireSiblingsAndDeleteCandidate).toHaveBeenCalledWith(
        'test-1',
        variant,
        'candidate-1',
      );
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/baseline.png',
        'http://storage/diff.png',
        'http://storage/stale-diff.png',
      ]);
    });

    it('drops urls still referenced by a baseline or live comparison from the stale list', async () => {
      mockResolvedTest();
      const comparison = makeComparison(makeBaseline(), makeCandidate());
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      screenshots.filterReclaimableUrls.mockResolvedValue([]);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage('my-project', 'my-test', 'comp-1');

      expect(storage.deleteAll).not.toHaveBeenCalled();
    });
  });

  describe('approvePdf', () => {
    function mockResolvedPdfTest() {
      testResolver.findTestOfKind.mockResolvedValue(pdfTest);
    }

    it('approves a PDF test', async () => {
      const comparison = makePdfComparison();
      mockResolvedPdfTest();
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      const result = await service.approvePdf(
        'my-project',
        'my-test',
        'pdf-comp-1',
      );

      expect(comparisons.findByIdForTest).toHaveBeenCalledWith(
        'test-1',
        'pdf-comp-1',
      );
      expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
      expect(pdfRenderCache.clearCache).toHaveBeenCalledWith(
        'http://storage/pdf-baseline.png',
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'domain_events_total',
        expect.objectContaining({ event: 'comparison_approved' }),
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'domain_events_total',
        expect.objectContaining({ event: 'baseline_updated' }),
      );

      expect(result).toEqual({
        approved: true,
        newBaselineUrl: 'http://storage/pdf-candidate.png',
      });
    });

    it('updates pdf baseline, approves comparison, and deletes the candidate row', async () => {
      mockResolvedPdfTest();
      comparisons.findByIdForTest.mockResolvedValue(makePdfComparison());
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approvePdf('my-project', 'my-test', 'pdf-comp-1');

      expect(screenshots.updateBaselineScreenshot).toHaveBeenCalledWith(
        'pdf-baseline-1',
        {
          imageHash: 'new-pdf-hash',
          imageUrl: 'http://storage/pdf-candidate.png',
          pageCount: 5,
        },
      );
      expect(comparisons.completePdfApproval).toHaveBeenCalledWith(
        'pdf-comp-1',
        undefined,
      );
      expect(retirement.retireSiblingsAndDeleteCandidate).toHaveBeenCalledWith(
        'test-1',
        variant,
        'pdf-candidate-1',
      );
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/pdf-baseline.png',
      ]);
    });

    it('clears and reclaims the diff pdf file after approval', async () => {
      mockResolvedPdfTest();
      const comparison = makePdfComparison() as any;
      comparison.diffPdfUrl = 'http://storage/pdf-diff.pdf';
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      comparisons.completePdfApproval.mockResolvedValue([
        'http://storage/pdf-diff.pdf',
      ]);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approvePdf('my-project', 'my-test', 'pdf-comp-1');

      expect(comparisons.completePdfApproval).toHaveBeenCalledWith(
        'pdf-comp-1',
        'http://storage/pdf-diff.pdf',
      );
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/pdf-baseline.png',
        'http://storage/pdf-diff.pdf',
      ]);
      expect(pdfRenderCache.clearCache).toHaveBeenCalledWith(
        'http://storage/pdf-diff.pdf',
      );
    });

    it('does not clear the diff reference when there is no diff pdf', async () => {
      mockResolvedPdfTest();
      comparisons.findByIdForTest.mockResolvedValue(makePdfComparison());
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approvePdf('my-project', 'my-test', 'pdf-comp-1');

      expect(comparisons.completePdfApproval).toHaveBeenCalledWith(
        'pdf-comp-1',
        undefined,
      );
    });

    it('throws when comparison is not found', async () => {
      mockResolvedPdfTest();
      comparisons.findByIdForTest.mockResolvedValue(null);
      await expect(
        service.approvePdf('my-project', 'my-test', 'comp-x'),
      ).rejects.toThrow(DomainError);
    });

    it('rejects approving an image test through the PDF endpoint', async () => {
      testResolver.findTestOfKind.mockRejectedValue(
        new DomainError('Test "my-test" is not a PDF test', 'BAD_REQUEST'),
      );

      await expect(
        service.approvePdf('my-project', 'my-test', 'comp-x'),
      ).rejects.toThrow(/not a PDF test/);
      expect(comparisons.findByIdForTest).not.toHaveBeenCalled();
      expect(comparisons.completePdfApproval).not.toHaveBeenCalled();
    });

    it('throws when pending comparison missing candidate', async () => {
      mockResolvedPdfTest();
      const comparison = makePdfComparison() as any;
      comparison.candidate = null;
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      await expect(
        service.approvePdf('my-project', 'my-test', 'comp-x'),
      ).rejects.toThrow(DomainError);
    });
  });
});
