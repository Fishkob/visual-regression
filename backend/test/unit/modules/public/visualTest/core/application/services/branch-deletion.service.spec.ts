import type { Mocked } from 'vitest';
import { BranchDeletionService } from '@public/visualTest/core/application/services/branch-deletion.service';
import { AuditService } from '@internal/audit/audit.service';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import {
  toOutcome,
  type StateChangeResult,
} from '@public/visualTest/core/application/services/state-change-options';
import { IJobProducer } from '@common/domain/job-queue.interface';
import { createMock } from '@test/utils/create-mock';

describe('BranchDeletionService', () => {
  let service: BranchDeletionService;
  let audit: Mocked<AuditService>;
  let branches: Mocked<BranchRepository>;
  let tests: Mocked<UnifiedTestRepository>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let jobQueue: Mocked<IJobProducer>;
  let workflow: Mocked<StateChangeWorkflow>;

  const main = {
    id: 'br-main',
    projectId: 'proj-1',
    name: 'main',
    targetBranchId: null,
    isArchived: false,
    createdAt: new Date(),
  };
  const feature = {
    ...main,
    id: 'br-feature',
    name: 'feature/x',
  };

  beforeEach(() => {
    branches = createMock<BranchRepository>();
    tests = createMock<UnifiedTestRepository>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    comparisons = createMock<UnifiedComparisonsRepository>();
    jobQueue = createMock<IJobProducer>();
    branches.findDependentNames.mockResolvedValue([]);
    workflow = createMock<StateChangeWorkflow>();
    workflow.executeStateChange.mockImplementation(
      async (fn: () => Promise<StateChangeResult<unknown>>) =>
        toOutcome(await fn()),
    );
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);
    service = new BranchDeletionService(
      branches,
      tests,
      screenshots,
      comparisons,
      jobQueue,
      workflow,
      audit,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancels jobs, deletes the branch and reclaims only unreferenced urls', async () => {
    branches.findById.mockResolvedValue(feature);
    branches.findDefault.mockResolvedValue(main);
    tests.findIdsByBranchId.mockResolvedValue(['test-1']);
    screenshots.findAllImageUrlsForTests.mockResolvedValue([
      'http://storage/base.png',
    ]);
    comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([
      'http://storage/diff.png',
    ]);
    screenshots.filterReclaimableUrls.mockResolvedValue([
      'http://storage/diff.png',
    ]);

    await service.delete('proj-1', 'br-feature', 'jane');

    expect(jobQueue.cancelByTestIds).toHaveBeenCalledWith(['test-1']);
    expect(branches.deleteById).toHaveBeenCalledWith('br-feature');
    expect(screenshots.filterReclaimableUrls).toHaveBeenCalledWith([
      'http://storage/base.png',
      'http://storage/diff.png',
    ]);
    expect(workflow.executeStateChange).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ retry: expect.any(Object) }),
    );
  });

  it('refuses to delete the default branch', async () => {
    branches.findById.mockResolvedValue(main);
    branches.findDefault.mockResolvedValue(main);

    await expect(
      service.delete('proj-1', 'br-main', 'jane'),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(branches.deleteById).not.toHaveBeenCalled();
  });

  it('rejects a branch of another project', async () => {
    branches.findById.mockResolvedValue({ ...feature, projectId: 'proj-2' });

    await expect(
      service.delete('proj-1', 'br-feature', 'jane'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects an unknown branch', async () => {
    branches.findById.mockResolvedValue(null);

    await expect(
      service.delete('proj-1', 'missing', 'jane'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('skips job cancellation and url collection for an empty branch', async () => {
    branches.findById.mockResolvedValue(feature);
    branches.findDefault.mockResolvedValue(main);
    tests.findIdsByBranchId.mockResolvedValue([]);
    screenshots.filterReclaimableUrls.mockResolvedValue([]);

    await service.delete('proj-1', 'br-feature', 'jane');

    expect(jobQueue.cancelByTestIds).not.toHaveBeenCalled();
    expect(screenshots.findAllImageUrlsForTests).not.toHaveBeenCalled();
    expect(branches.deleteById).toHaveBeenCalledWith('br-feature');
  });

  // Deleting a target would silently re-point its dependants at the project
  // default (the FK is ON DELETE SET NULL) and leave their clones holding the
  // deleted branch's content under a new label.
  it('refuses to delete a branch that other branches inherit from', async () => {
    branches.findById.mockResolvedValue(feature);
    branches.findDefault.mockResolvedValue(main);
    branches.findDependentNames.mockResolvedValue([
      'feature/child',
      'release/2',
    ]);

    await expect(
      service.delete('proj-1', 'br-feature', 'jane'),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'Branch "feature/x" is the target of "feature/child", "release/2" — retarget them before deleting it',
    });

    expect(branches.deleteById).not.toHaveBeenCalled();
    expect(jobQueue.cancelByTestIds).not.toHaveBeenCalled();
  });
});
