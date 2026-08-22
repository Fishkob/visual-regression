import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';

describe('ProjectRepository', () => {
  let repository: ProjectRepository;
  let mockTxCtx: jest.Mocked<TransactionContext>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      project: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      unifiedVariant: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      unifiedComparison: {
        groupBy: jest.fn(),
      },
      unifiedTest: {
        findMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(ProjectRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByName', () => {
    it('returns a project when found', async () => {
      const project = {
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date(),
      };
      mockClient.project.findUnique.mockResolvedValue(project);

      const result = await repository.findByName('my-project');

      expect(result).toEqual(project);
      expect(mockClient.project.findUnique).toHaveBeenCalledWith({
        where: { name: 'my-project' },
      });
    });

    it('returns null when not found', async () => {
      mockClient.project.findUnique.mockResolvedValue(null);

      const result = await repository.findByName('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns all projects with total count', async () => {
      const projects = [
        { id: 'proj-1', name: 'a', createdAt: new Date() },
        { id: 'proj-2', name: 'b', createdAt: new Date() },
      ];
      mockClient.project.findMany.mockResolvedValue(projects);
      mockClient.project.count.mockResolvedValue(2);

      const result = await repository.findAll();

      expect(result.data).toEqual(projects);
      expect(result.total).toBe(2);
      expect(mockClient.project.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: undefined,
      });
      expect(mockClient.project.count).toHaveBeenCalledWith({
        where: undefined,
      });
    });

    it('applies pagination when provided', async () => {
      mockClient.project.findMany.mockResolvedValue([]);
      mockClient.project.count.mockResolvedValue(10);

      await repository.findAll({ skip: 5, take: 5 });

      expect(mockClient.project.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      });
    });

    it('returns empty array when no projects exist', async () => {
      mockClient.project.findMany.mockResolvedValue([]);
      mockClient.project.count.mockResolvedValue(0);

      const result = await repository.findAll();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('create', () => {
    it('creates a project when name does not exist', async () => {
      const project = {
        id: 'proj-1',
        name: 'new-project',
        createdAt: new Date(),
      };
      mockClient.project.findUnique.mockResolvedValue(null);
      mockClient.project.create.mockResolvedValue(project);

      const result = await repository.create('new-project');

      expect(result).toEqual(project);
      expect(mockClient.project.findUnique).toHaveBeenCalledWith({
        where: { name: 'new-project' },
      });
      expect(mockClient.project.create).toHaveBeenCalledWith({
        data: { name: 'new-project' },
      });
    });

    it('throws DomainError when name already exists', async () => {
      const existing = {
        id: 'proj-1',
        name: 'existing',
        createdAt: new Date(),
      };
      mockClient.project.findUnique.mockResolvedValue(existing);

      await expect(repository.create('existing')).rejects.toThrow(DomainError);
      await expect(repository.create('existing')).rejects.toMatchObject({
        code: 'E_UNIQUE_CONSTRAINT',
      });
      expect(mockClient.project.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteByName', () => {
    it('deletes a project by name', async () => {
      mockClient.project.delete.mockResolvedValue(undefined);

      await repository.deleteByName('my-project');

      expect(mockClient.project.delete).toHaveBeenCalledWith({
        where: { name: 'my-project' },
      });
    });
  });
});
