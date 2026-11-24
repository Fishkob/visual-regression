import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { TeamsRepository } from '@internal/teams/teams.repository';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    team: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    teamMember: { deleteMany: vi.fn(), createMany: vi.fn() },
    project: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

// Policy, not mechanism (ADR-059): what the query makes visible — the ordering a
// list is read in, the relation shape it carries, the exact set it writes — is
// what this spec pins. Locking and isolation have nothing to assert here.
describe('TeamsRepository', () => {
  let repository: TeamsRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });
    mockTxCtx.assertInTransaction = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(TeamsRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists teams by name with members and owned projects', async () => {
    await repository.findAll();

    expect(mockClient.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: 'asc' },
        include: expect.objectContaining({
          members: expect.objectContaining({
            orderBy: { user: { username: 'asc' } },
          }),
          projects: expect.objectContaining({
            orderBy: { name: 'asc' },
          }),
        }),
      }),
    );
  });

  it('flattens the membership join down to the user fields the API exposes', async () => {
    mockClient.team.findUnique.mockResolvedValue({
      id: 't-1',
      name: 'Checkout',
      createdBy: 'admin',
      createdAt: new Date('2026-01-01'),
      members: [
        {
          userId: 'u-1',
          user: { id: 'u-1', username: 'alice', role: 'MEMBER' },
        },
      ],
      projects: [{ id: 'p-1', name: 'checkout-ui' }],
    });

    const row = await repository.findById('t-1');

    expect(row).toEqual({
      id: 't-1',
      name: 'Checkout',
      createdBy: 'admin',
      createdAt: new Date('2026-01-01'),
      members: [{ userId: 'u-1', username: 'alice', role: 'MEMBER' }],
      projects: [{ id: 'p-1', name: 'checkout-ui' }],
    });
  });

  it('answers null for a team that does not exist', async () => {
    await expect(repository.findById('ghost')).resolves.toBeNull();
  });

  it('replaces the membership set in one delete plus one insert', async () => {
    await repository.replaceMembers('t-1', ['u-2', 'u-3']);

    expect(mockTxCtx.assertInTransaction).toHaveBeenCalled();
    expect(mockClient.teamMember.deleteMany).toHaveBeenCalledWith({
      where: { teamId: 't-1' },
    });
    expect(mockClient.teamMember.createMany).toHaveBeenCalledWith({
      data: [
        { teamId: 't-1', userId: 'u-2' },
        { teamId: 't-1', userId: 'u-3' },
      ],
      skipDuplicates: true,
    });
  });

  it('does not insert when the member set is empty', async () => {
    await repository.replaceMembers('t-1', []);

    expect(mockClient.teamMember.deleteMany).toHaveBeenCalled();
    expect(mockClient.teamMember.createMany).not.toHaveBeenCalled();
  });

  it('counts the projects a team owns before it may be deleted', async () => {
    await repository.countProjects('t-1');

    expect(mockClient.project.count).toHaveBeenCalledWith({
      where: { teamId: 't-1' },
    });
  });

  it('reads the caller memberships by name, not by join order', async () => {
    await repository.findForUser('u-1');

    expect(mockClient.team.findMany).toHaveBeenCalledWith({
      where: { members: { some: { userId: 'u-1' } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  });

  // The predicate has one owner (ADR-083 decision 3): a member sees the projects
  // of its teams plus every shared one. Pinning the OR here is what keeps a
  // future read from re-deriving the rule with one branch missing.
  it('derives the visible project set from membership plus the shared flag', async () => {
    mockClient.project.findMany.mockResolvedValue([
      { id: 'p-1' },
      { id: 'p-shared' },
    ]);

    const ids = await repository.findVisibleProjectIdsForUser('u-1');

    expect(mockClient.project.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { team: { members: { some: { userId: 'u-1' } } } },
          { isShared: true },
        ],
      },
      select: { id: true },
    });
    expect(ids).toEqual(['p-1', 'p-shared']);
  });

  it('resolves the existing subset of a candidate member list', async () => {
    mockClient.user.findMany.mockResolvedValue([{ id: 'u-2' }]);

    const existing = await repository.findExistingUserIds(['u-2', 'ghost']);

    expect(mockClient.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u-2', 'ghost'] } },
      select: { id: true },
    });
    expect([...existing]).toEqual(['u-2']);
  });

  it('skips the user lookup for an empty member list', async () => {
    await expect(repository.findExistingUserIds([])).resolves.toEqual(
      new Set(),
    );
    expect(mockClient.user.findMany).not.toHaveBeenCalled();
  });

  it('refuses to write outside a transaction', async () => {
    mockTxCtx.assertInTransaction = vi.fn(() => {
      throw new Error('assertInTransaction');
    });

    await expect(repository.create('Checkout', 'admin')).rejects.toThrow(
      'assertInTransaction',
    );
    expect(mockClient.team.create).not.toHaveBeenCalled();
  });
});
