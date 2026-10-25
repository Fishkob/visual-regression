import type { Mocked } from 'vitest';
import { StorageSizeBackfillTask } from '@internal/data-deletion/tasks/storage-size-backfill.task';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import type { IStorageProvider } from '@common/domain/storage-provider.interface';
import type { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('StorageSizeBackfillTask', () => {
  let task: StorageSizeBackfillTask;
  let projects: Mocked<ProjectRepository>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let storage: Mocked<IStorageProvider>;
  let logger: Mocked<AppLoggerService>;

  beforeEach(() => {
    projects = createMock<ProjectRepository>();
    projects.findAll.mockResolvedValue({
      data: [{ id: 'p1', name: 'shop', createdAt: new Date() }],
      total: 1,
    });
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.findMissingSizes.mockResolvedValue([
      { id: 's1', imageUrl: 'http://storage/s1.png' },
    ]);
    screenshots.setSizeBytes.mockResolvedValue(undefined);
    comparisons = createMock<UnifiedComparisonsRepository>();
    comparisons.findMissingDiffSizes.mockResolvedValue([
      { id: 'c1', diffImageUrl: 'http://storage/d1.png', diffPdfUrl: null },
    ]);
    comparisons.setDiffSizeBytes.mockResolvedValue(undefined);
    storage = createMock<IStorageProvider>();
    storage.get.mockResolvedValue(Buffer.alloc(42));
    logger = createMockLogger() as unknown as Mocked<AppLoggerService>;
    task = new StorageSizeBackfillTask(
      projects,
      screenshots,
      comparisons,
      storage,
      logger,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads legacy objects once and records their size', async () => {
    const result = await task.execute();

    expect(screenshots.setSizeBytes).toHaveBeenCalledWith('s1', 42);
    expect(comparisons.setDiffSizeBytes).toHaveBeenCalledWith('c1', 42);
    expect(result.counters).toEqual([
      { name: 'storage_size_backfilled_total', value: 2 },
    ]);
  });
});
