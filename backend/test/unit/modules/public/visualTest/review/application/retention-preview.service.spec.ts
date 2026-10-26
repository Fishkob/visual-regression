import type { Mocked } from 'vitest';
import { RetentionPreviewService } from '@public/visualTest/review/application/retention-preview.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BaselineRevisionRepository } from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import type { AppConfigService } from '@config/app-config.service';
import { createMock } from '@test/utils/create-mock';
import { createMockProjectRepository } from '@test/utils/mocks';

describe('RetentionPreviewService', () => {
  let service: RetentionPreviewService;
  let projects: Mocked<ProjectRepository>;
  let revisions: Mocked<BaselineRevisionRepository>;
  let runs: Mocked<RunRepository>;
  let storage: Mocked<StorageUsageService>;

  beforeEach(() => {
    projects = createMockProjectRepository();
    projects.findByName.mockResolvedValue({
      id: 'p1',
      name: 'shop',
      createdAt: new Date(),
      baselineRevisionLimit: 3,
      runHistoryDays: null,
      orphanGraceHours: 12,
    });
    revisions = createMock<BaselineRevisionRepository>();
    revisions.countBeyondLimit.mockResolvedValue(4);
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
      orphanGraceHours: 12,
    });
    service = new RetentionPreviewService(projects, revisions, runs, storage, {
      baselineHistory: { limit: 10 },
      retention: { runHistoryDays: 365 },
    } as AppConfigService);
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
});
