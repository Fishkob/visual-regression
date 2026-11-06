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
      branchRetentionDays: 30,
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
    expect(usage.branchRetentionDays).toBe(30);
  });

  it('rejects an upload over the hard quota', async () => {
    await expect(service.assertWithinQuota('shop', 300)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(
      service.assertWithinQuota('shop', 200),
    ).resolves.toBeUndefined();
  });

  // The admitted bytes are charged into the total, otherwise every upload of one
  // refresh window would be decided against the same number and a CI burst would
  // land as a block. A rejected upload is not charged.
  it('charges an admitted upload and leaves a rejected one uncharged', async () => {
    await service.assertWithinQuota('shop', 200);
    expect(projects.addStorageUsage).toHaveBeenCalledWith('p1', 200n);

    projects.addStorageUsage.mockClear();
    await expect(service.assertWithinQuota('shop', 300)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(projects.addStorageUsage).not.toHaveBeenCalled();
  });

  // The quota check reads the project's cached total (ADR-060) instead of
  // summing every evidence row on every upload: 68 ms of database time at 500k
  // screenshot rows, and no index avoids visiting the rows.
  it('trusts a fresh cached total instead of summing the rows', async () => {
    projects.findByName.mockResolvedValue({
      id: 'p1',
      name: 'shop',
      createdAt: new Date(),
      storageQuotaBytes: 1000n,
      storageUsedBytes: 900n,
      storageUsageComputedAt: new Date(),
    });

    // 900 cached + 100 fits: admitted without touching the rows.
    await expect(
      service.assertWithinQuota('shop', 100),
    ).resolves.toBeUndefined();
    expect(screenshots.sumSizeForProject).not.toHaveBeenCalled();
    expect(comparisons.sumDiffSizeForProject).not.toHaveBeenCalled();
    expect(projects.recordStorageUsage).not.toHaveBeenCalled();
    expect(projects.addStorageUsage).toHaveBeenCalledWith('p1', 100n);
  });

  it('re-derives and records a total older than the refresh window', async () => {
    projects.findByName.mockResolvedValue({
      id: 'p1',
      name: 'shop',
      createdAt: new Date(),
      storageQuotaBytes: 1000n,
      // A stale 10 would let a 201-byte write through; the real total (800)
      // must be what the decision uses.
      storageUsedBytes: 10n,
      storageUsageComputedAt: new Date(Date.now() - 60_000),
    });

    await expect(service.assertWithinQuota('shop', 201)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(projects.recordStorageUsage).toHaveBeenCalledWith(
      'p1',
      800n,
      expect.any(Date),
    );
  });

  it('derives and records the total on the first check of a project', async () => {
    await expect(service.assertWithinQuota('shop', 300)).rejects.toBeInstanceOf(
      DomainError,
    );

    expect(projects.recordStorageUsage).toHaveBeenCalledWith(
      'p1',
      800n,
      expect.any(Date),
    );
  });

  // The read model reports file and diff counts, so it keeps deriving from the
  // rows — a cached byte total would not tell it how many files there are.
  it('reports exact usage and counts even when a cached total exists', async () => {
    projects.findByName.mockResolvedValue({
      id: 'p1',
      name: 'shop',
      createdAt: new Date(),
      storageQuotaBytes: 1000n,
      storageUsedBytes: 1n,
      storageUsageComputedAt: new Date(),
    });

    const usage = await service.get('shop');

    expect(usage.usageBytes).toBe('800');
    expect(usage.fileCount).toBe(3);
    expect(usage.diffCount).toBe(2);
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
