import type { Mocked } from 'vitest';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';
import { createMockProjectRepository } from '@test/utils/mocks';

describe('StorageUsageService', () => {
  let service: StorageUsageService;
  let projects: Mocked<ProjectRepository>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;

  beforeEach(() => {
    projects = createMockProjectRepository();
    projects.findByName.mockResolvedValue({
      id: 'p1',
      name: 'shop',
      createdAt: new Date(),
      storageQuotaBytes: 1000n,
      quotaSoftPercent: 80,
      baselineRevisionLimit: 5,
      runHistoryDays: 30,
      orphanGraceHours: 24,
    });
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.sumSizeForProject.mockResolvedValue({ bytes: 600n, count: 3 });
    comparisons = createMock<UnifiedComparisonsRepository>();
    comparisons.sumDiffSizeForProject.mockResolvedValue({
      bytes: 200n,
      count: 2,
    });
    service = new StorageUsageService(projects, screenshots, comparisons);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports usage, percentage and the soft warning', async () => {
    const usage = await service.get('shop');

    expect(usage.usageBytes).toBe('800');
    expect(usage.percent).toBe(80);
    expect(usage.warning).toBe(true);
    expect(usage.fileCount).toBe(3);
    expect(usage.diffCount).toBe(2);
    expect(usage.baselineRevisionLimit).toBe(5);
  });

  it('rejects an upload over the hard quota', async () => {
    await expect(service.assertWithinQuota('shop', 300)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(
      service.assertWithinQuota('shop', 200),
    ).resolves.toBeUndefined();
  });

  it('does not enforce a null quota', async () => {
    projects.findByName.mockResolvedValue({
      id: 'p1',
      name: 'shop',
      createdAt: new Date(),
      storageQuotaBytes: null,
    });

    await expect(
      service.assertWithinQuota('shop', 10_000_000),
    ).resolves.toBeUndefined();
    expect((await service.get('shop')).quotaBytes).toBeNull();
  });
});
