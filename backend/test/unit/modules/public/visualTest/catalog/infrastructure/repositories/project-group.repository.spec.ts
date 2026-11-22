import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { ProjectGroupRepository } from '@public/visualTest/catalog/infrastructure/repositories/project-group.repository';
import { ALL_PROJECTS } from '@common/domain/project-scope';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    projectGroup: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: { count: vi.fn() },
  };
}

describe('ProjectGroupRepository', () => {
  let repository: ProjectGroupRepository;
  let txCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();

    // Transaction-aware: the repository asks the ambient context for its
    // client, which is the bare connection when no transaction is open.
    txCtx = createMock<TransactionContext>();
    Object.defineProperty(txCtx, 'client', {
      get: () => mockClient,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectGroupRepository,
        { provide: TransactionContext, useValue: txCtx },
      ],
    }).compile();

    repository = module.get(ProjectGroupRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findAll', () => {
    it('maps project counts and sorts by name', async () => {
      const createdAt = new Date();
      mockClient.projectGroup.findMany.mockResolvedValue([
        {
          id: 'g1',
          name: 'Checkout',
          createdAt,
          _count: { projects: 2 },
        },
      ]);

      await expect(repository.findAll(ALL_PROJECTS)).resolves.toEqual([
        { id: 'g1', name: 'Checkout', createdAt, projectCount: 2 },
      ]);
      expect(mockClient.projectGroup.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { _count: { select: { projects: { where: {} } } } },
      });
    });

    it('counts only the projects the caller may see', async () => {
      mockClient.projectGroup.findMany.mockResolvedValue([]);

      await repository.findAll({
        kind: 'ids',
        ids: new Set(['p-1', 'p-shared']),
      });

      // The badge must not count another team's products.
      expect(mockClient.projectGroup.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              projects: { where: { id: { in: ['p-1', 'p-shared'] } } },
            },
          },
        },
      });
    });
  });

  describe('create', () => {
    it('throws E_UNIQUE_CONSTRAINT when the name exists', async () => {
      mockClient.projectGroup.findUnique.mockResolvedValue({
        id: 'existing',
        name: 'Checkout',
      });

      await expect(repository.create('Checkout')).rejects.toMatchObject({
        code: 'E_UNIQUE_CONSTRAINT',
      });
      expect(mockClient.projectGroup.create).not.toHaveBeenCalled();
    });

    it('maps a created row with count to projectCount', async () => {
      const createdAt = new Date();
      mockClient.projectGroup.findUnique.mockResolvedValue(null);
      mockClient.projectGroup.create.mockResolvedValue({
        id: 'g1',
        name: 'Checkout',
        createdAt,
        _count: { projects: 0 },
      });

      await expect(repository.create('Checkout')).resolves.toEqual({
        id: 'g1',
        name: 'Checkout',
        createdAt,
        projectCount: 0,
      });
      expect(mockClient.projectGroup.create).toHaveBeenCalledWith({
        data: { name: 'Checkout' },
        include: { _count: { select: { projects: true } } },
      });
    });
  });

  describe('rename', () => {
    it('throws NOT_FOUND when the group is missing', async () => {
      mockClient.projectGroup.findUnique.mockResolvedValue(null);

      await expect(
        repository.rename('missing', 'Storefront'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mockClient.projectGroup.findFirst).not.toHaveBeenCalled();
      expect(mockClient.projectGroup.update).not.toHaveBeenCalled();
    });

    it('throws E_UNIQUE_CONSTRAINT when another group has the name', async () => {
      mockClient.projectGroup.findUnique.mockResolvedValue({
        id: 'g1',
        name: 'Checkout',
      });
      mockClient.projectGroup.findFirst.mockResolvedValue({
        id: 'g2',
        name: 'Storefront',
      });

      await expect(repository.rename('g1', 'Storefront')).rejects.toMatchObject(
        { code: 'E_UNIQUE_CONSTRAINT' },
      );
      expect(mockClient.projectGroup.findFirst).toHaveBeenCalledWith({
        where: { name: 'Storefront', id: { not: 'g1' } },
      });
      expect(mockClient.projectGroup.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws NOT_FOUND when the group is missing', async () => {
      mockClient.projectGroup.findUnique.mockResolvedValue(null);

      await expect(
        repository.delete('missing', ALL_PROJECTS),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mockClient.projectGroup.delete).not.toHaveBeenCalled();
    });

    it('deletes a group without counting projects for an unrestricted caller', async () => {
      mockClient.projectGroup.findUnique.mockResolvedValue({
        id: 'g1',
        _count: { projects: 3 },
      });

      await expect(
        repository.delete('g1', ALL_PROJECTS),
      ).resolves.toBeUndefined();
      expect(mockClient.project.count).not.toHaveBeenCalled();
      expect(mockClient.projectGroup.delete).toHaveBeenCalledWith({
        where: { id: 'g1' },
      });
    });

    // The FK clears the label on every project in the group, so a member who can
    // only see some of them would silently rewrite the rest (ADR-082).
    it('refuses to delete a group that holds a project outside the scope', async () => {
      mockClient.projectGroup.findUnique.mockResolvedValue({
        id: 'g1',
        _count: { projects: 3 },
      });
      mockClient.project.count.mockResolvedValue(2);

      await expect(
        repository.delete('g1', { kind: 'ids', ids: new Set(['p-1', 'p-2']) }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(mockClient.projectGroup.delete).not.toHaveBeenCalled();
    });

    it('deletes when every project in the group is in scope', async () => {
      mockClient.projectGroup.findUnique.mockResolvedValue({
        id: 'g1',
        _count: { projects: 2 },
      });
      mockClient.project.count.mockResolvedValue(2);

      await expect(
        repository.delete('g1', { kind: 'ids', ids: new Set(['p-1', 'p-2']) }),
      ).resolves.toBeUndefined();
      expect(mockClient.project.count).toHaveBeenCalledWith({
        where: { groupId: 'g1', id: { in: ['p-1', 'p-2'] } },
      });
      expect(mockClient.projectGroup.delete).toHaveBeenCalledWith({
        where: { id: 'g1' },
      });
    });
  });

  describe('findById', () => {
    it('returns the group row', async () => {
      const row = {
        id: 'g1',
        name: 'Checkout',
        createdAt: new Date(),
      };
      mockClient.projectGroup.findUnique.mockResolvedValue(row);

      await expect(repository.findById('g1')).resolves.toEqual(row);
      expect(mockClient.projectGroup.findUnique).toHaveBeenCalledWith({
        where: { id: 'g1' },
      });
    });
  });
});
