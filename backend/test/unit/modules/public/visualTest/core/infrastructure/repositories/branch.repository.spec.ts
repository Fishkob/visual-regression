import type { Mocked } from 'vitest';
import { TransactionContext } from '@/prisma/transaction-context';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    branch: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      update: vi.fn(),
    },
    unifiedVariant: {
      updateMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };
}

describe('BranchRepository', () => {
  let repository: BranchRepository;
  let txCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;

  const branch = {
    id: 'br-1',
    projectId: 'proj-1',
    name: 'main',
    targetBranchId: null,
    isArchived: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockClient = makeMockClient();
    txCtx = createMock<TransactionContext>();
    Object.defineProperty(txCtx, 'client', { get: () => mockClient });
    repository = new BranchRepository(txCtx);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds the default branch and asserts the transaction contract', async () => {
    mockClient.branch.findFirst.mockResolvedValue(branch);

    await expect(repository.findDefault('proj-1')).resolves.toEqual(branch);
    expect(mockClient.branch.findFirst).toHaveBeenCalledWith({
      where: { projectId: 'proj-1', defaultFor: { id: 'proj-1' } },
      select: expect.objectContaining({ id: true, name: true }),
    });
    expect(txCtx.assertInTransaction).not.toHaveBeenCalled();
  });

  it('finds a branch by project and name', async () => {
    mockClient.branch.findUnique.mockResolvedValue(branch);

    await expect(
      repository.findByProjectAndName('proj-1', 'main'),
    ).resolves.toEqual(branch);
    expect(mockClient.branch.findUnique).toHaveBeenCalledWith({
      where: { projectId_name: { projectId: 'proj-1', name: 'main' } },
      select: expect.any(Object),
    });
  });

  it('finds a branch by id', async () => {
    mockClient.branch.findUnique.mockResolvedValue(branch);

    await expect(repository.findById('br-1')).resolves.toEqual(branch);
  });

  it('creates the default branch and links it on the project', async () => {
    mockClient.branch.create.mockResolvedValue(branch);

    await expect(repository.createDefault('proj-1')).resolves.toEqual(branch);

    expect(txCtx.assertInTransaction).toHaveBeenCalled();
    expect(mockClient.branch.create).toHaveBeenCalledWith({
      data: { projectId: 'proj-1', name: 'main' },
      select: expect.any(Object),
    });
    expect(mockClient.project.update).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { defaultBranchId: 'br-1' },
    });
  });

  it('creates a feature branch with its target', async () => {
    mockClient.branch.create.mockResolvedValue(branch);

    await repository.create('proj-1', 'feature/x', 'br-main');

    expect(mockClient.branch.create).toHaveBeenCalledWith({
      data: {
        projectId: 'proj-1',
        name: 'feature/x',
        targetBranchId: 'br-main',
      },
      select: expect.any(Object),
    });
  });

  it('archives a branch', async () => {
    await repository.setArchived('br-1', true);

    expect(mockClient.branch.update).toHaveBeenCalledWith({
      where: { id: 'br-1' },
      data: { isArchived: true },
    });
  });

  it('sets the target branch', async () => {
    await repository.setTarget('br-1', 'br-main');

    expect(mockClient.branch.update).toHaveBeenCalledWith({
      where: { id: 'br-1' },
      data: { targetBranchId: 'br-main' },
    });
  });

  it('sets the project default branch', async () => {
    await repository.setDefault('proj-1', 'br-1');

    expect(mockClient.project.update).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { defaultBranchId: 'br-1' },
    });
  });

  it('lists branches and hides archived ones by default', async () => {
    mockClient.branch.findMany.mockResolvedValue([branch]);

    await repository.list('proj-1', false);

    expect(mockClient.branch.findMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1', isArchived: false },
      select: expect.any(Object),
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
  });

  it('lists archived branches when requested', async () => {
    mockClient.branch.findMany.mockResolvedValue([]);

    await repository.list('proj-1', true);

    expect(mockClient.branch.findMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
      select: expect.any(Object),
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
  });

  it('pins every variant of the branch when it becomes the default', async () => {
    await repository.markAllOwned('br-1');

    expect(mockClient.unifiedVariant.updateMany).toHaveBeenCalledWith({
      where: { test: { branchId: 'br-1' } },
      data: { isInherited: false },
    });
  });

  it('deletes a branch by id', async () => {
    await repository.deleteById('br-1');

    expect(mockClient.branch.delete).toHaveBeenCalledWith({
      where: { id: 'br-1' },
    });
  });

  it('lists the branch ids of a project', async () => {
    mockClient.branch.findMany.mockResolvedValue([
      { id: 'br-1' },
      { id: 'br-2' },
    ]);

    await expect(repository.findIdsByProjectId('proj-1')).resolves.toEqual([
      'br-1',
      'br-2',
    ]);
  });

  describe('findTargetChainIds', () => {
    it('walks explicit targets up to the default branch', async () => {
      mockClient.branch.findUnique
        .mockResolvedValueOnce({
          ...branch,
          id: 'br-feature',
          targetBranchId: 'br-main',
        })
        .mockResolvedValueOnce({
          ...branch,
          id: 'br-main',
          targetBranchId: null,
        });
      mockClient.branch.findFirst.mockResolvedValue({
        ...branch,
        id: 'br-main',
      });

      await expect(
        repository.findTargetChainIds('br-feature'),
      ).resolves.toEqual(['br-main']);
    });

    it('falls back to the project default branch when the target is null', async () => {
      mockClient.branch.findUnique.mockResolvedValue({
        ...branch,
        id: 'br-feature',
        projectId: 'proj-1',
        targetBranchId: null,
      });
      mockClient.branch.findFirst.mockResolvedValue({
        ...branch,
        id: 'br-main',
      });

      await expect(
        repository.findTargetChainIds('br-feature'),
      ).resolves.toEqual(['br-main']);
    });

    it('does not add the branch itself as its own target', async () => {
      mockClient.branch.findUnique.mockResolvedValue({
        ...branch,
        id: 'br-main',
        projectId: 'proj-1',
        targetBranchId: null,
      });
      mockClient.branch.findFirst.mockResolvedValue({
        ...branch,
        id: 'br-main',
      });

      await expect(repository.findTargetChainIds('br-main')).resolves.toEqual(
        [],
      );
    });

    it('stops walking when a branch is missing', async () => {
      mockClient.branch.findUnique.mockResolvedValue(null);

      await expect(
        repository.findTargetChainIds('br-unknown'),
      ).resolves.toEqual([]);
    });
  });

  describe('branch retention', () => {
    const cutoff = new Date('2025-05-01T00:00:00Z');

    it('touches the activity clock outside a transaction, one guarded statement', async () => {
      await repository.touchActivity('shop', 'feature/x');

      // The write is standalone by design: the upload already committed, and a
      // missing transaction must not fail it (ADR-067).
      expect(txCtx.assertInTransaction).not.toHaveBeenCalled();
      expect(mockClient.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('selects the inactive candidates with the guards the sweep promises', async () => {
      mockClient.branch.findFirst.mockResolvedValue(branch);
      mockClient.branch.findMany.mockResolvedValue([]);

      await repository.findInactive('proj-1', cutoff);

      expect(mockClient.branch.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          projectId: 'proj-1',
          isArchived: false,
          id: { not: 'br-1' },
          lastActivityAt: { lt: cutoff },
          createdAt: { lt: cutoff },
          derivedBranches: { none: {} },
          tests: {
            none: {
              comparisons: { some: { status: 'PENDING_APPROVAL' } },
            },
          },
        }),
        select: expect.any(Object),
        orderBy: [{ lastActivityAt: 'asc' }, { name: 'asc' }],
      });
    });

    it('counts with the same predicate and reports zero without a default branch', async () => {
      mockClient.branch.findFirst.mockResolvedValue(branch);
      mockClient.branch.count.mockResolvedValue(3);

      await expect(repository.countInactive('proj-1', cutoff)).resolves.toBe(3);
      expect(mockClient.branch.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          projectId: 'proj-1',
          isArchived: false,
        }),
      });

      mockClient.branch.findFirst.mockResolvedValue(null);
      await expect(repository.countInactive('proj-1', cutoff)).resolves.toBe(0);
      await expect(repository.findInactive('proj-1', cutoff)).resolves.toEqual(
        [],
      );
    });
  });
});
