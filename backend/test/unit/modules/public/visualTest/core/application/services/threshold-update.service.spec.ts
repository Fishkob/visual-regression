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

describe('ThresholdUpdateService', () => {
  let service: ThresholdUpdateService;
  let statusService: jest.Mocked<TestStatusService>;
  let screenshots: jest.Mocked<UnifiedScreenshotRepository>;
  let comparisons: jest.Mocked<UnifiedComparisonsRepository>;
  let retirement: jest.Mocked<ComparisonRetirementService>;
  let storage: jest.Mocked<IStorageProvider>;
  let uow: jest.Mocked<PrismaUnitOfWork>;

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
    comparisons = createMock<UnifiedComparisonsRepository>();
    retirement = createMock<ComparisonRetirementService>();
    retirement.retirePendingComparisons.mockResolvedValue([]);
    storage = createMockStorage() as unknown as jest.Mocked<IStorageProvider>;
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });
    uow = createMockUoW() as unknown as jest.Mocked<PrismaUnitOfWork>;
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
      ],
    }).compile();

    service = module.get(ThresholdUpdateService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
