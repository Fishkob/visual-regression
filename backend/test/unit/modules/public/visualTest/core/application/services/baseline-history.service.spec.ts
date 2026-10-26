import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainError } from '@common/domain/domain-error';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { AppLoggerService } from '@common/logging/app-logger.service';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { ScreenshotType } from '@public/visualTest/core/domain/types/visual-test.types';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { BaselineHistoryService } from '@public/visualTest/core/application/services/baseline-history.service';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import {
  BaselineRevisionRepository,
  type BaselineRevisionRow,
} from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { AppConfigService } from '@config/app-config.service';
import { AuditService } from '@internal/audit/audit.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { createMock } from '@test/utils/create-mock';
import {
  createMockLogger,
  createMockStorage,
  createMockUoW,
} from '@test/utils/mocks';

describe('BaselineHistoryService', () => {
  let service: BaselineHistoryService;
  let revisions: Mocked<BaselineRevisionRepository>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let variants: Mocked<VariantStore>;
  let retirement: Mocked<ComparisonRetirementService>;
  let testResolver: Mocked<TestResolver>;
  let statusService: Mocked<TestStatusService>;
  let storage: Mocked<IStorageProvider>;
  let audit: Mocked<AuditService>;

  const test = { id: 'test-1', name: 'checkout', kind: 'image' as const };
  const variant = Variant.fromStrings('1920x1080', 'chrome', 'staging');
  const baseline = new ScreenshotEntity({
    id: 'baseline-1',
    visualTestId: 'test-1',
    type: ScreenshotType.BASELINE,
    imageHash: 'current-hash',
    imageUrl: 'http://storage/current.png',
    variant,
    createdAt: new Date('2024-01-02'),
    pixelDiffThreshold: 12,
    pageCount: null,
  });

  const revision: BaselineRevisionRow = {
    id: 'revision-1',
    testId: 'test-1',
    variantId: 'variant-1',
    viewport: '1920x1080',
    browser: 'chrome',
    environment: 'staging',
    imageUrl: 'http://storage/old.png',
    imageHash: 'old-hash',
    pageCount: null,
    pixelDiffThreshold: 30,
    reason: 'approval',
    createdBy: 'jane.doe',
    createdAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    revisions = createMock<BaselineRevisionRepository>();
    revisions.create.mockResolvedValue(revision);
    revisions.pruneBeyond.mockResolvedValue([]);
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.findBaselineByVariant.mockResolvedValue(baseline);
    screenshots.updateBaselineScreenshot.mockResolvedValue(undefined);
    screenshots.filterReclaimableUrls.mockImplementation((urls) =>
      Promise.resolve(urls),
    );
    variants = createMock<VariantStore>();
    variants.findVariantId.mockResolvedValue('variant-1');
    variants.findVariantWithBaseline.mockResolvedValue({
      baselineId: 'baseline-1',
      isInherited: false,
      baseline: null,
    });
    retirement = createMock<ComparisonRetirementService>();
    retirement.supersedeForVariant.mockResolvedValue([]);
    testResolver = createMock<TestResolver>();
    testResolver.findOwnTest.mockResolvedValue(test);
    statusService = createMock<TestStatusService>();
    statusService.recomputeStatus.mockResolvedValue(undefined);
    storage = createMockStorage() as unknown as Mocked<IStorageProvider>;
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);
    const uow = createMockUoW() as unknown as Mocked<PrismaUnitOfWork>;
    const metrics = createMock<IMetricsRecorder>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaselineHistoryService,
        { provide: BaselineRevisionRepository, useValue: revisions },
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: VariantStore, useValue: variants },
        { provide: ComparisonRetirementService, useValue: retirement },
        { provide: TestResolver, useValue: testResolver },
        {
          provide: ProjectRepository,
          useValue: { findByTestId: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: AppConfigService,
          useValue: { baselineHistory: { limit: 10 } },
        },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: AuditService, useValue: audit },
        { provide: PrismaUnitOfWork, useValue: uow },
        { provide: TestStatusService, useValue: statusService },
        { provide: AppLoggerService, useValue: createMockLogger() },
        { provide: METRICS_RECORDER, useValue: metrics },
        StateChangeWorkflow,
        {
          provide: StorageUsageService,
          useValue: createMock<StorageUsageService>(),
        },
      ],
    }).compile();

    service = module.get(BaselineHistoryService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('signs the revision URLs and applies the configured limit', async () => {
      revisions.findForTest.mockResolvedValue([revision]);

      const result = await service.list('shop', 'checkout', {}, 'feature/x');

      expect(testResolver.findOwnTest).toHaveBeenCalledWith(
        'shop',
        'checkout',
        'feature/x',
      );
      expect(revisions.findForTest).toHaveBeenCalledWith('test-1', {}, 10);
      expect(result).toEqual([
        { ...revision, signedImageUrl: 'http://storage/old.png' },
      ]);
    });
  });

  describe('recordOutgoingBaseline', () => {
    it('snapshots the replaced baseline, prunes and filters the reclaimable URLs', async () => {
      revisions.pruneBeyond.mockResolvedValue(['http://storage/pruned.png']);
      screenshots.filterReclaimableUrls.mockResolvedValue([]);

      const result = await service.recordOutgoingBaseline({
        testId: 'test-1',
        variant,
        baseline,
        reason: 'approval',
        createdBy: 'jane.doe',
      });

      expect(revisions.create).toHaveBeenCalledWith({
        testId: 'test-1',
        variantId: 'variant-1',
        viewport: '1920x1080',
        browser: 'chrome',
        environment: 'staging',
        imageUrl: 'http://storage/current.png',
        imageHash: 'current-hash',
        pageCount: null,
        pixelDiffThreshold: 12,
        reason: 'approval',
        createdBy: 'jane.doe',
      });
      expect(revisions.pruneBeyond).toHaveBeenCalledWith(
        'test-1',
        'variant-1',
        10,
      );
      expect(screenshots.filterReclaimableUrls).toHaveBeenCalledWith([
        'http://storage/pruned.png',
      ]);
      expect(result).toEqual([]);
    });

    it('rejects a test whose variant row is missing', async () => {
      variants.findVariantId.mockResolvedValue(null);

      await expect(
        service.recordOutgoingBaseline({
          testId: 'test-1',
          variant,
          baseline,
          reason: 'approval',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(revisions.create).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('records the current baseline, rewrites the content and retires pending work', async () => {
      revisions.findByIdForTest.mockResolvedValue(revision);
      retirement.supersedeForVariant.mockResolvedValue([
        'http://storage/candidate.png',
      ]);

      const result = await service.restore({
        projectName: 'shop',
        testName: 'checkout',
        revisionId: 'revision-1',
        restoredBy: 'reviewer',
      });

      expect(revisions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'http://storage/current.png',
          imageHash: 'current-hash',
          reason: 'restore',
          createdBy: 'reviewer',
        }),
      );
      expect(screenshots.updateBaselineScreenshot).toHaveBeenCalledWith(
        'baseline-1',
        {
          imageHash: 'old-hash',
          imageUrl: 'http://storage/old.png',
          pageCount: null,
          pixelDiffThreshold: 30,
        },
      );
      expect(retirement.supersedeForVariant).toHaveBeenCalledWith(
        'test-1',
        expect.any(Variant),
      );
      expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'reviewer',
          action: 'baseline.restore',
          projectName: 'shop',
          testName: 'checkout',
          metadata: expect.objectContaining({ revisionId: 'revision-1' }),
        }),
      );
      expect(result).toEqual({
        baselineUrl: 'http://storage/old.png',
        signedBaselineUrl: 'http://storage/old.png',
      });
    });

    it('rejects a revision that is already the current baseline', async () => {
      revisions.findByIdForTest.mockResolvedValue({
        ...revision,
        imageUrl: baseline.imageUrl,
        imageHash: baseline.imageHash,
      });

      await expect(
        service.restore({
          projectName: 'shop',
          testName: 'checkout',
          revisionId: 'revision-1',
          restoredBy: 'reviewer',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(screenshots.updateBaselineScreenshot).not.toHaveBeenCalled();
    });

    it('rejects a restore on an inherited variant', async () => {
      revisions.findByIdForTest.mockResolvedValue(revision);
      variants.findVariantWithBaseline.mockResolvedValue({
        baselineId: 'baseline-1',
        isInherited: true,
        baseline: null,
      });

      await expect(
        service.restore({
          projectName: 'shop',
          testName: 'checkout',
          revisionId: 'revision-1',
          restoredBy: 'reviewer',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Inherited baselines cannot be restored on this branch',
      });
    });

    it('rejects an unknown revision', async () => {
      revisions.findByIdForTest.mockResolvedValue(null);

      await expect(
        service.restore({
          projectName: 'shop',
          testName: 'checkout',
          revisionId: 'missing',
          restoredBy: 'reviewer',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
