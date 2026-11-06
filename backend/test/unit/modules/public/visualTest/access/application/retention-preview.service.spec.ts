import type { Mocked } from 'vitest';
import { RetentionPreviewService } from '@public/visualTest/access/application/retention-preview.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BaselineRevisionRepository } from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import type { AppConfigService } from '@config/app-config.service';
import { createMock } from '@test/utils/create-mock';
import { createMockProjectRepository } from '@test/utils/mocks';

describe('RetentionPreviewService', () => {
  let service: RetentionPreviewService;
  let projects: Mocked<ProjectRepository>;
  let revisions: Mocked<BaselineRevisionRepository>;
  let branches: Mocked<BranchRepository>;
  let runs: Mocked<RunRepository>;
  let storage: Mocked<StorageUsageService>;
  let config: AppConfigService;

  beforeEach(() => {
    projects = createMockProjectRepository();
    projects.findByName.mockResolvedValue({
      id: 'p1',
      name: 'shop',
      createdAt: new Date(),
      baselineRevisionLimit: 3,
      runHistoryDays: null,
      branchRetentionDays: 7,
      orphanGraceHours: 12,
    });
    revisions = createMock<BaselineRevisionRepository>();
    revisions.countBeyondLimit.mockResolvedValue(4);
    branches = createMock<BranchRepository>();
    branches.countInactive.mockResolvedValue(2);
    runs = createMock<RunRepository>();
    runs.countFinishedBefore.mockResolvedValue(2);
    storage = createMock<StorageUsageService>();
    storage.get.mockResolvedValue({
      usageBytes: '100',
      quotaBytes: '1000',
      percent: 10,
      softPercent: 80,
      warning: false,
      fileCount: 1,
      diffCount: 0,
      baselineRevisionLimit: 3,
      runHistoryDays: null,
      branchRetentionDays: 7,
      orphanGraceHours: 12,
    });
    config = {
      baselineHistory: { limit: 10 },
      retention: { runHistoryDays: 365, branchRetentionDays: 30 },
    } as AppConfigService;
    service = new RetentionPreviewService(
      projects,
      revisions,
      branches,
      runs,
      storage,
      config,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports the project override and what retention would reclaim', async () => {
    const preview = await service.get('shop');

    expect(preview.baselineRevisions).toEqual({ limit: 3, overflow: 4 });
    expect(preview.runs.days).toBe(365);
    expect(preview.runs.eligible).toBe(2);
    expect(preview.effectiveOrphanGraceHours).toBe(12);
    expect(preview.storage.percent).toBe(10);
  });

  // The dry run and the sweep read one predicate: the preview asks the branch
  // repository with the resolved window, not with a second derivation of it.
  it('counts the branches the sweep would delete with the project window', async () => {
    const preview = await service.get('shop');

    expect(preview.branches).toEqual({ days: 7, eligible: 2 });
    const cutoff = branches.countInactive.mock.calls[0]![1];
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(6 * 86_400_000);
    expect(Date.now() - cutoff.getTime()).toBeLessThan(8 * 86_400_000);
  });

  it('reports no branch candidates when the window is off', async () => {
    projects.findByName.mockResolvedValue({
      id: 'p1',
      name: 'shop',
      createdAt: new Date(),
      branchRetentionDays: 0,
    });

    const preview = await service.get('shop');

    expect(preview.branches).toEqual({ days: 0, eligible: 0 });
    expect(branches.countInactive).not.toHaveBeenCalled();
  });
});
