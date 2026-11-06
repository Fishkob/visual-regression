import type { Mocked } from 'vitest';
import { BulkActionService } from '@public/visualTest/review/application/bulk-action.service';
import {
  ApprovalBatch,
  ApprovalService,
} from '@public/visualTest/review/application/approval.service';
import { ProjectService } from '@public/visualTest/catalog/application/project.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';

describe('BulkActionService', () => {
  let service: BulkActionService;
  let approvals: Mocked<ApprovalService>;
  let deletion: Mocked<TestDeletionService>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let tests: Mocked<UnifiedTestRepository>;
  let branches: Mocked<BranchResolver>;
  let projects: Mocked<ProjectService>;

  beforeEach(() => {
    approvals = createMock<ApprovalService>();
    deletion = createMock<TestDeletionService>();
    deletion.deleteTest.mockResolvedValue(undefined);
    comparisons = createMock<UnifiedComparisonsRepository>();
    tests = createMock<UnifiedTestRepository>();
    branches = createMock<BranchResolver>();
    branches.resolveRead.mockResolvedValue({
      projectId: 'p1',
      branchId: 'b1',
      branchName: 'main',
      isDefault: true,
      isArchived: false,
    });
    projects = createMock<ProjectService>();
    projects.updateProjectGroup.mockResolvedValue({} as never);
    service = new BulkActionService(
      approvals,
      deletion,
      comparisons,
      tests,
      branches,
      projects,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pairs each selection with its owning test and reports missing ones', async () => {
    comparisons.findTestOfComparisonById
      .mockResolvedValueOnce({
        id: 't1',
        name: 'login',
        kind: 'image',
        branch: { name: 'main' },
      } as never)
      .mockResolvedValueOnce(null);
    approvals.approveMany.mockResolvedValue(new ApprovalBatch(['c1'], []));

    const result = await service.approve('shop', ['c1', 'c2'], 'ada');

    expect(result.approved).toEqual([{ id: 'c1', success: true }]);
    expect(result.failed).toEqual([
      {
        id: 'c2',
        success: false,
        error: 'Comparison not found in this project',
      },
    ]);
    expect(approvals.approveMany).toHaveBeenCalledWith(
      'shop',
      [
        {
          comparisonId: 'c1',
          testName: 'login',
          kind: 'image',
          branchName: 'main',
        },
      ],
      'ada',
    );
  });

  it('deletes each test and reports missing tests per item', async () => {
    tests.findByBranchAndTestName
      .mockResolvedValueOnce({ id: 't1', name: 'login' } as never)
      .mockResolvedValueOnce(null);

    const result = await service.deleteTests(
      'shop',
      ['login', 'gone'],
      'main',
      'ada',
    );

    expect(result.deleted).toEqual([{ id: 'login', success: true }]);
    expect(result.failed[0]).toEqual(
      expect.objectContaining({ id: 'gone', success: false }),
    );
    expect(deletion.deleteTest).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ actor: 'ada', testName: 'login' }),
    );
  });

  it('moves projects and reports failures per item', async () => {
    projects.updateProjectGroup
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new DomainError('Project not found', 'NOT_FOUND'));

    const result = await service.moveProjects(['a', 'b'], 'g1');

    expect(result.moved).toEqual([{ id: 'a', success: true }]);
    // A DomainError's message is written for the client, so it is returned.
    expect(result.failed).toEqual([
      { id: 'b', success: false, error: 'Project not found' },
    ]);
  });

  it('does not leak an internal error message into a bulk row', async () => {
    projects.updateProjectGroup.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 10.0.0.5:5432'),
    );

    const result = await service.moveProjects(['a'], 'g1');

    expect(result.failed).toEqual([
      { id: 'a', success: false, error: 'Move failed' },
    ]);
    expect(result.failed[0].error).not.toContain('ECONNREFUSED');
  });
});
