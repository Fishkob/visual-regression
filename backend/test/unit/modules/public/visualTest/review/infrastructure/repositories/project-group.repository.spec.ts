import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ProjectGroupRepository } from '@public/visualTest/catalog/infrastructure/repositories/project-group.repository';
import { createMock } from '@test/utils/create-mock';

describe('ProjectGroupRepository', () => {
  let repository: ProjectGroupRepository;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      projectGroup: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', {
      get: () => mockClient,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectGroupRepository,
        { provide: PrismaConnection, useValue: mockConnection },
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

      await expect(repository.findAll()).resolves.toEqual([
        { id: 'g1', name: 'Checkout', createdAt, projectCount: 2 },
      ]);
      expect(mockClient.projectGroup.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { _count: { select: { projects: true } } },
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

      await expect(repository.delete('missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mockClient.projectGroup.delete).not.toHaveBeenCalled();
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
