import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchReadRepository } from '@public/visualTest/catalog/infrastructure/repositories/branch-read.repository';
import { createMock } from '@test/utils/create-mock';

describe('BranchReadRepository', () => {
  let repository: BranchReadRepository;
  let connection: Mocked<PrismaConnection>;
  let branchResolver: Mocked<BranchResolver>;
  let mockClient: any;

  const createdAt = new Date('2026-01-01T00:00:00Z');

  beforeEach(() => {
    mockClient = {
      branch: { findMany: vi.fn() },
      $queryRaw: vi.fn(),
    };
    connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, 'client', { get: () => mockClient });
    branchResolver = createMock<BranchResolver>();
    branchResolver.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-main',
      branchName: 'main',
      isDefault: true,
      isArchived: false,
    });
    repository = new BranchReadRepository(connection, branchResolver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists branches with their effective target, test and pending counts', async () => {
    mockClient.branch.findMany.mockResolvedValue([
      {
        id: 'br-main',
        name: 'main',
        isArchived: false,
        targetBranch: null,
        _count: { tests: 2 },
        createdAt,
      },
      {
        id: 'br-feature',
        name: 'feature/x',
        isArchived: false,
        targetBranch: { name: 'release/1.2' },
        _count: { tests: 1 },
        createdAt,
      },
      {
        id: 'br-inherit',
        name: 'feature/y',
        isArchived: true,
        targetBranch: null,
        _count: { tests: 0 },
        createdAt,
      },
    ]);
    mockClient.$queryRaw.mockResolvedValue([
      { branchId: 'br-feature', pendingCount: 3n },
    ]);

    const result = await repository.list('app', true);

    expect(result).toEqual([
      {
        name: 'main',
        isDefault: true,
        isArchived: false,
        targetBranchName: null,
        testCount: 2,
        pendingCount: 0,
        createdAt,
      },
      {
        name: 'feature/x',
        isDefault: false,
        isArchived: false,
        targetBranchName: 'release/1.2',
        testCount: 1,
        pendingCount: 3,
        createdAt,
      },
      {
        name: 'feature/y',
        isDefault: false,
        isArchived: true,
        targetBranchName: 'main',
        testCount: 0,
        pendingCount: 0,
        createdAt,
      },
    ]);
    expect(mockClient.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'proj-1' } }),
    );
  });

  it('hides archived branches by default', async () => {
    mockClient.branch.findMany.mockResolvedValue([]);
    mockClient.$queryRaw.mockResolvedValue([]);

    await repository.list('app', false);

    expect(mockClient.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'proj-1', isArchived: false },
      }),
    );
  });

  it('resolves the project through the default branch', async () => {
    mockClient.branch.findMany.mockResolvedValue([]);
    mockClient.$queryRaw.mockResolvedValue([]);

    await repository.list('app', false);

    expect(branchResolver.resolveRead).toHaveBeenCalledWith('app');
  });
});
