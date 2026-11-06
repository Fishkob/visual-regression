import type { Mocked } from 'vitest';
import {
  BranchRetentionTask,
  BRANCH_RETENTION_ACTOR,
} from '@internal/data-deletion/tasks/branch-retention.task';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BranchDeletionService } from '@public/visualTest/core/application/services/branch-deletion.service';
import type { AppConfigService } from '@config/app-config.service';
import type { AppLoggerService } from '@common/logging/app-logger.service';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('BranchRetentionTask', () => {
  let task: BranchRetentionTask;
  let projects: Mocked<ProjectRepository>;
  let branches: Mocked<BranchRepository>;
  let deletion: Mocked<BranchDeletionService>;
  let logger: Mocked<AppLoggerService>;
  let config: AppConfigService;

  function branch(id: string, name: string) {
    return {
      id,
      projectId: 'p1',
      name,
      targetBranchId: null,
      isArchived: false,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };
  }

  beforeEach(() => {
    projects = createMock<ProjectRepository>();
    branches = createMock<BranchRepository>();
    deletion = createMock<BranchDeletionService>();
    logger = createMockLogger() as unknown as Mocked<AppLoggerService>;
    config = {
      retention: { runHistoryDays: 365, branchRetentionDays: 90 },
    } as AppConfigService;
    task = new BranchRetentionTask(
      projects,
      branches,
      deletion,
      config,
      logger,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the per-project window when set and the deployment default otherwise', async () => {
    projects.listBranchRetentionProjects.mockResolvedValue([
      { id: 'p1', branchRetentionDays: 7 },
      { id: 'p2', branchRetentionDays: null },
    ]);
    branches.findInactive.mockResolvedValue([]);

    const result = await task.execute();

    expect(branches.findInactive).toHaveBeenCalledTimes(2);
    const firstCutoff = branches.findInactive.mock.calls[0]![1];
    const secondCutoff = branches.findInactive.mock.calls[1]![1];
    expect(Date.now() - firstCutoff.getTime()).toBeGreaterThan(6 * 86_400_000);
    expect(Date.now() - secondCutoff.getTime()).toBeGreaterThan(
      89 * 86_400_000,
    );
    expect(result.counters).toEqual([
      { name: 'cleanup_branches_deleted_total', value: 0 },
    ]);
  });

  // The window is opt-in: 0 is "off", not "delete everything", and an
  // installation that never sets the variable must see no query at all.
  it('skips a project whose window is disabled', async () => {
    projects.listBranchRetentionProjects.mockResolvedValue([
      { id: 'p1', branchRetentionDays: 0 },
      { id: 'p2', branchRetentionDays: null },
    ]);
    config = {
      retention: { runHistoryDays: 365, branchRetentionDays: 0 },
    } as AppConfigService;
    task = new BranchRetentionTask(
      projects,
      branches,
      deletion,
      config,
      logger,
    );

    const result = await task.execute();

    expect(branches.findInactive).not.toHaveBeenCalled();
    expect(deletion.delete).not.toHaveBeenCalled();
    expect(result.counters).toEqual([
      { name: 'cleanup_branches_deleted_total', value: 0 },
    ]);
  });

  it('deletes every candidate through the guarded deletion service', async () => {
    projects.listBranchRetentionProjects.mockResolvedValue([
      { id: 'p1', branchRetentionDays: 30 },
    ]);
    branches.findInactive.mockResolvedValue([
      branch('br-1', 'feature/a'),
      branch('br-2', 'feature/b'),
    ]);
    deletion.delete.mockResolvedValue(undefined);

    const result = await task.execute();

    expect(deletion.delete).toHaveBeenNthCalledWith(
      1,
      'p1',
      'br-1',
      BRANCH_RETENTION_ACTOR,
    );
    expect(deletion.delete).toHaveBeenNthCalledWith(
      2,
      'p1',
      'br-2',
      BRANCH_RETENTION_ACTOR,
    );
    expect(result.counters).toEqual([
      { name: 'cleanup_branches_deleted_total', value: 2 },
    ]);
    expect(result.gauges?.[0]?.name).toBe('cleanup_branches_last_run');
  });

  // The candidate query and the delete are not one transaction: a dependant
  // branch or an approval can arrive between them, and the guard that refuses
  // the delete must cost that one branch, not the rest of the sweep.
  it('keeps the sweep going when a guard refuses one deletion', async () => {
    projects.listBranchRetentionProjects.mockResolvedValue([
      { id: 'p1', branchRetentionDays: 30 },
    ]);
    branches.findInactive.mockResolvedValue([
      branch('br-1', 'feature/a'),
      branch('br-2', 'feature/b'),
    ]);
    deletion.delete
      .mockRejectedValueOnce(
        new DomainError('Branch "feature/a" is the target of "x"', 'CONFLICT'),
      )
      .mockResolvedValueOnce(undefined);

    const result = await task.execute();

    expect(deletion.delete).toHaveBeenCalledTimes(2);
    expect(result.counters).toEqual([
      { name: 'cleanup_branches_deleted_total', value: 1 },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Branch retention skipped "feature/a"',
      expect.objectContaining({ projectId: 'p1' }),
    );
  });
});
