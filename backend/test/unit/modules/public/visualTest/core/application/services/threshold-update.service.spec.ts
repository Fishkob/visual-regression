import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainError } from '@common/domain/domain-error';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { ThresholdUpdateService } from '@public/visualTest/core/application/services/threshold-update.service';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { createMock } from '@test/utils/create-mock';
import {
  createMockUoW,
  createMockStorage,
  createMockLogger,
} from '@test/utils/mocks';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';

describe('ThresholdUpdateService', () => {
  let service: ThresholdUpdateService;
  let statusService: Mocked<TestStatusService>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let retirement: Mocked<ComparisonRetirementService>;
  let storage: Mocked<IStorageProvider>;
  let uow: Mocked<PrismaUnitOfWork>;
  let audit: Mocked<AuditService>;

  function comparisonRow(
    overrides: Partial<{ id: string; mismatchPixelCount: number }> = {},
  ) {
    return {
      id: 'cmp-1',
      mismatchPixelCount: 5,
      ...overrides,
    };
  }

  beforeEach(async () => {
    statusService = createMock<TestStatusService>();
    statusService.recomputeStatus.mockResolvedValue(undefined);
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.findThresholdsByIds.mockResolvedValue([0]);
    comparisons = createMock<UnifiedComparisonsRepository>();
    retirement = createMock<ComparisonRetirementService>();
    retirement.retirePendingComparisons.mockResolvedValue([]);
    storage = createMockStorage() as unknown as Mocked<IStorageProvider>;
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });
    uow = createMockUoW() as unknown as Mocked<PrismaUnitOfWork>;
    audit = createMock<AuditService>();
    const metrics = createMock<IMetricsRecorder>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThresholdUpdateService,
        StateChangeWorkflow,
        { provide: PrismaUnitOfWork, useValue: uow },
        { provide: TestStatusService, useValue: statusService },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: METRICS_RECORDER, useValue: metrics },
        { provide: AppLoggerService, useValue: createMockLogger() },
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: UnifiedComparisonsRepository, useValue: comparisons },
        { provide: ComparisonRetirementService, useValue: retirement },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ThresholdUpdateService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates baseline thresholds and auto-accepts pending comparisons within the new value', async () => {
    screenshots.findBaselineIdsByFilters.mockResolvedValue(['baseline-A']);
    comparisons.findPendingForBaselines.mockResolvedValue([comparisonRow()]);
    retirement.retirePendingComparisons.mockResolvedValue([
      'http://storage/diff.png',
    ]);

    await service.update('test-1', 'my-test', 20);

    expect(screenshots.updateThresholdMany).toHaveBeenCalledWith(
      ['baseline-A'],
      20,
    );
    expect(retirement.retirePendingComparisons).toHaveBeenCalledWith('test-1', [
      'cmp-1',
    ]);
    expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
    expect(storage.deleteAll).toHaveBeenCalledWith(['http://storage/diff.png']);
  });

  it('keeps comparisons whose mismatch is above the new value', async () => {
    screenshots.findBaselineIdsByFilters.mockResolvedValue(['baseline-A']);
    comparisons.findPendingForBaselines.mockResolvedValue([
      comparisonRow({ mismatchPixelCount: 25 }),
    ]);

    await service.update('test-1', 'my-test', 20);

    expect(screenshots.updateThresholdMany).toHaveBeenCalledWith(
      ['baseline-A'],
      20,
    );
    expect(retirement.retirePendingComparisons).not.toHaveBeenCalled();
  });

  it('runs the update inside a retried Serializable transaction', async () => {
    screenshots.findBaselineIdsByFilters.mockResolvedValue(['baseline-A']);
    comparisons.findPendingForBaselines.mockResolvedValue([]);

    await service.update('test-1', 'my-test', 20);

    expect(uow.execute).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('throws NOT_FOUND when no baseline matches', async () => {
    screenshots.findBaselineIdsByFilters.mockResolvedValue([]);

    await expect(service.update('test-1', 'my-test', 20)).rejects.toThrow(
      DomainError,
    );
    expect(screenshots.updateThresholdMany).not.toHaveBeenCalled();
  });

  it('declares a change (not a noop) when baselines are mutated even if nothing is auto-accepted', async () => {
    screenshots.findBaselineIdsByFilters.mockResolvedValue(['baseline-A']);
    comparisons.findPendingForBaselines.mockResolvedValue([]);

    await service.update('test-1', 'my-test', 20);

    expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
  });

  it('returns the count of comparisons auto-accepted by the committed update', async () => {
    screenshots.findBaselineIdsByFilters.mockResolvedValue(['baseline-A']);
    comparisons.findPendingForBaselines.mockResolvedValue([
      comparisonRow({ mismatchPixelCount: 5 }),
      comparisonRow({ id: 'cmp-2', mismatchPixelCount: 30 }),
    ]);

    const result = await service.update('test-1', 'my-test', 20);

    expect(result).toEqual({ autoAcceptedCount: 1 });
    expect(retirement.retirePendingComparisons).toHaveBeenCalledWith('test-1', [
      'cmp-1',
    ]);
  });

  describe('threshold audit', () => {
    it('records test.threshold with the previous values, the new value and the auto-accepted count', async () => {
      screenshots.findBaselineIdsByFilters.mockResolvedValue([
        'baseline-A',
        'baseline-B',
      ]);
      screenshots.findThresholdsByIds.mockResolvedValue([0, 0]);
      comparisons.findPendingForBaselines.mockResolvedValue([comparisonRow()]);

      await service.update('test-1', 'my-test', 20, undefined, false, {
        actor: 'jane',
        projectName: 'my-project',
        branchName: 'main',
      });

      expect(audit.record).toHaveBeenCalledWith({
        actor: 'jane',
        action: AUDIT_ACTIONS.testThreshold,
        projectName: 'my-project',
        testName: 'my-test',
        branchName: 'main',
        targetType: 'test',
        targetId: 'test-1',
        metadata: {
          from: [0],
          to: 20,
          autoAcceptedCount: 1,
        },
      });
    });

    it('reports every distinct previous threshold of the matching baselines', async () => {
      screenshots.findBaselineIdsByFilters.mockResolvedValue([
        'baseline-A',
        'baseline-B',
      ]);
      screenshots.findThresholdsByIds.mockResolvedValue([0, 10]);
      comparisons.findPendingForBaselines.mockResolvedValue([]);

      await service.update('test-1', 'my-test', 20);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { from: [0, 10], to: 20, autoAcceptedCount: 0 },
        }),
      );
    });

    it('does not audit a preview', async () => {
      screenshots.findBaselineIdsByFilters.mockResolvedValue(['baseline-A']);
      comparisons.findPendingForBaselines.mockResolvedValue([comparisonRow()]);

      await service.update('test-1', 'my-test', 20, undefined, true);

      expect(audit.record).not.toHaveBeenCalled();
    });

    it('does not audit when the transaction fails', async () => {
      screenshots.findBaselineIdsByFilters.mockResolvedValue(['baseline-A']);
      comparisons.findPendingForBaselines.mockResolvedValue([]);
      screenshots.updateThresholdMany.mockRejectedValue(new Error('db down'));

      await expect(service.update('test-1', 'my-test', 20)).rejects.toThrow(
        'db down',
      );

      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('preview returns the auto-accept count without mutating anything', async () => {
    screenshots.findBaselineIdsByFilters.mockResolvedValue(['baseline-A']);
    comparisons.findPendingForBaselines.mockResolvedValue([
      comparisonRow({ mismatchPixelCount: 5 }),
      comparisonRow({ id: 'cmp-2', mismatchPixelCount: 30 }),
    ]);

    const result = await service.update(
      'test-1',
      'my-test',
      20,
      undefined,
      true,
    );

    expect(result).toEqual({ autoAcceptedCount: 1 });
    expect(screenshots.updateThresholdMany).not.toHaveBeenCalled();
    expect(retirement.retirePendingComparisons).not.toHaveBeenCalled();
    expect(statusService.recomputeStatus).not.toHaveBeenCalled();
    expect(uow.execute).not.toHaveBeenCalled();
  });

  it('preview throws NOT_FOUND when no baseline matches', async () => {
    screenshots.findBaselineIdsByFilters.mockResolvedValue([]);

    await expect(
      service.update('test-1', 'my-test', 20, undefined, true),
    ).rejects.toThrow(DomainError);
    expect(screenshots.updateThresholdMany).not.toHaveBeenCalled();
  });
});
