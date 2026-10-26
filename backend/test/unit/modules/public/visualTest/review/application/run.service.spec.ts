import type { Mocked } from 'vitest';
import { DomainError } from '@common/domain/domain-error';
import { RunService } from '@public/visualTest/review/application/run.service';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { createMock } from '@test/utils/create-mock';

describe('RunService', () => {
  let service: RunService;
  let runs: Mocked<RunRepository>;
  let branches: Mocked<BranchResolver>;
  let projects: Mocked<ProjectRepository>;
  let approvals: Mocked<ApprovalService>;

  const run = {
    id: 'run-1',
    projectId: 'p-1',
    branchId: 'b-1',
    key: 'ci-1',
    commitSha: null,
    commitMessage: null,
    ciUrl: null,
    metadata: null,
    createdAt: new Date('2026-01-01'),
    lastActivityAt: new Date('2026-01-01'),
    finishedAt: null,
    finishedBy: null,
    branch: { name: 'main' },
  };

  const baseCounts = {
    pendingComparisons: 0,
    mutedPending: 0,
    pendingJobs: 0,
    failedJobs: 0,
    approved: 0,
    testCount: 0,
  };

  beforeEach(() => {
    runs = createMock<RunRepository>();
    branches = createMock<BranchResolver>();
    branches.resolveRead.mockResolvedValue({
      projectId: 'p-1',
      branchId: 'b-1',
      branchName: 'main',
      isDefault: true,
      isArchived: false,
    });
    projects = createMock<ProjectRepository>();
    projects.findByName.mockResolvedValue({
      id: 'p-1',
      name: 'shop',
      createdAt: new Date(),
    });
    approvals = createMock<ApprovalService>();
    runs.findByBranchKey.mockResolvedValue(run);
    runs.statusCounts.mockResolvedValue(baseCounts);
    runs.pendingComparisonsForRun.mockResolvedValue([]);
    runs.approvalsForRun.mockResolvedValue([]);
    service = new RunService(runs, branches, projects, approvals);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a pending state while work is outstanding', async () => {
    runs.statusCounts.mockResolvedValue({
      ...baseCounts,
      pendingComparisons: 2,
      testCount: 2,
    });

    const result = await service.status('shop', 'ci-1');

    expect(result.status.state).toBe('pending');
    expect(result.status.pendingComparisons).toBe(2);
  });

  it('reports failure before pending', async () => {
    runs.statusCounts.mockResolvedValue({
      ...baseCounts,
      pendingComparisons: 1,
      failedJobs: 1,
    });

    expect((await service.status('shop', 'ci-1')).status.state).toBe('failed');
  });

  it('reports passed when only muted comparisons remain', async () => {
    runs.findByBranchKey.mockResolvedValue({
      ...run,
      finishedAt: new Date('2026-01-02'),
    });
    runs.statusCounts.mockResolvedValue({
      ...baseCounts,
      pendingComparisons: 1,
      mutedPending: 1,
    });

    const result = await service.status('shop', 'ci-1');

    // A muted test does not hold the gate (docs/ci-integration.md); the count
    // stays in the payload so the consumer can explain the gap.
    expect(result.status.state).toBe('passed');
    expect(result.status.pendingComparisons).toBe(1);
    expect(result.status.mutedPending).toBe(1);
  });

  it('reports passed only for a finished run', async () => {
    runs.findByBranchKey.mockResolvedValue({
      ...run,
      finishedAt: new Date('2026-01-02'),
    });

    expect((await service.status('shop', 'ci-1')).status.state).toBe('passed');
  });

  it('reports open for an unfinished run without work', async () => {
    expect((await service.status('shop', 'ci-1')).status.state).toBe('open');
  });

  it('returns 404 for an unknown run', async () => {
    runs.findByBranchKey.mockResolvedValue(null);

    await expect(service.status('shop', 'missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('finishes a run and returns the refreshed status', async () => {
    runs.finish.mockResolvedValue(true);
    runs.findById.mockResolvedValue({
      ...run,
      finishedAt: new Date('2026-01-03'),
    });

    const result = await service.finish('shop', 'ci-1', 'jane');

    expect(runs.finish).toHaveBeenCalledWith('run-1', 'jane');
    expect(result.status.state).toBe('passed');
  });

  it('sends every pending comparison to the approval batch', async () => {
    runs.pendingComparisonsForRun.mockResolvedValue([
      {
        id: 'cmp-1',
        mismatchPixelCount: 10,
        mismatchPageCount: null,
        createdAt: new Date(),
        test: {
          name: 'checkout',
          kind: 'image',
          branch: { name: 'main' },
        },
        baseline: {
          variant: {
            viewport: '1920x1080',
            browser: 'chrome',
            environment: 'staging',
          },
        },
      },
      {
        id: 'cmp-2',
        mismatchPixelCount: 3,
        mismatchPageCount: null,
        createdAt: new Date(),
        test: {
          name: 'invoice',
          kind: 'pdf',
          branch: { name: 'main' },
        },
        baseline: {
          variant: {
            viewport: '1920x1080',
            browser: 'chrome',
            environment: 'staging',
          },
        },
      },
    ] as never);
    approvals.approveMany.mockResolvedValue({
      approved: ['cmp-1'],
      pending: [],
      failed: [{ comparisonId: 'cmp-2', error: 'stale' }],
    });

    const principal = { principalType: 'user' as const, principalId: 'user-1' };
    const result = await service.approveAll('shop', 'ci-1', 'jane', principal);

    expect(result.approved).toBe(1);
    expect(result.failed).toEqual([{ comparisonId: 'cmp-2', error: 'stale' }]);
    expect(approvals.approveMany).toHaveBeenCalledWith(
      'shop',
      [
        {
          comparisonId: 'cmp-1',
          testName: 'checkout',
          kind: 'image',
          branchName: 'main',
        },
        {
          comparisonId: 'cmp-2',
          testName: 'invoice',
          kind: 'pdf',
          branchName: 'main',
        },
      ],
      'jane',
      principal,
    );
  });

  it('lists runs only for an existing project', async () => {
    runs.listForProject.mockResolvedValue({ data: [run], total: 1 });

    const result = await service.list('shop', undefined, 0, 20);

    expect(result.total).toBe(1);
    expect(runs.listForProject).toHaveBeenCalledWith('shop', undefined, 0, 20);
  });

  it('rejects listing a missing project', async () => {
    projects.findByName.mockResolvedValue(null);

    await expect(
      service.list('missing', undefined, 0, 20),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
