import type { Mocked } from 'vitest';
import { BulkActionService } from '@public/visualTest/review/application/bulk-action.service';
import { ApprovalBatch } from '@public/visualTest/review/application/approval-batch';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { createMock } from '@test/utils/create-mock';

describe('BulkActionService', () => {
  let service: BulkActionService;
  let approvals: Mocked<ApprovalService>;
  let deletion: Mocked<TestDeletionService>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let tests: Mocked<UnifiedTestRepository>;
  let branches: Mocked<BranchResolver>;

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
    service = new BulkActionService(
      approvals,
      deletion,
      comparisons,
      tests,
      branches,
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
});
