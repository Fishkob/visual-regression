import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import type { TestKind, TestStatus } from '@/prisma/client';
import { createMock } from '@test/utils/create-mock';

describe('UnifiedTestRepository', () => {
  let repository: UnifiedTestRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: any;
  let mockProjects: Mocked<ProjectRepository>;

  beforeEach(async () => {
    mockClient = {
      unifiedTest: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      unifiedVariant: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
    };

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    mockProjects = createMock<ProjectRepository>();
    mockProjects.getOrCreate.mockResolvedValue({
      id: 'proj-1',
      name: 'my-project',
      createdAt: new Date(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedTestRepository,
        { provide: ProjectRepository, useValue: mockProjects },
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(UnifiedTestRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findIdsByProjectId', () => {
    it('returns only the ids of tests for a project', async () => {
      const tests = [
        { id: 'test-1', name: 'a', projectId: 'proj-1' },
        { id: 'test-2', name: 'b', projectId: 'proj-1' },
      ];
      mockClient.unifiedTest.findMany.mockResolvedValue(tests);

      const result = await repository.findIdsByProjectId('proj-1');

      expect(result).toEqual(['test-1', 'test-2']);
      expect(mockClient.unifiedTest.findMany).toHaveBeenCalledWith({
        where: { branch: { projectId: 'proj-1' } },
        select: { id: true },
      });
    });

    it('returns empty array when no tests', async () => {
      mockClient.unifiedTest.findMany.mockResolvedValue([]);

      const result = await repository.findIdsByProjectId('proj-1');

      expect(result).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('updates the test status', async () => {
      mockClient.unifiedTest.update.mockResolvedValue(undefined);

      await repository.updateStatus('test-1', 'PENDING_APPROVAL' as TestStatus);

      expect(mockClient.unifiedTest.update).toHaveBeenCalledWith({
        where: { id: 'test-1' },
        data: { status: 'PENDING_APPROVAL' },
      });
    });
  });

  describe('deleteByIds', () => {
    it('deletes multiple tests in one query', async () => {
      mockClient.unifiedTest.deleteMany.mockResolvedValue({ count: 2 });

      await repository.deleteByIds(['test-1', 'test-2']);

      expect(mockClient.unifiedTest.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['test-1', 'test-2'] } },
      });
    });

    it('skips the query for an empty id list', async () => {
      await repository.deleteByIds([]);

      expect(mockClient.unifiedTest.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('findByBranchAndTestName', () => {
    it('looks a test up by branch and name', async () => {
      const test = {
        id: 'test-1',
        name: 'my-test',
        kind: 'image' as TestKind,
        createdAt: new Date(),
      };
      mockClient.unifiedTest.findFirst.mockResolvedValue(test);

      const result = await repository.findByBranchAndTestName(
        'br-1',
        'my-test',
      );

      expect(result).toEqual(test);
      expect(mockClient.unifiedTest.findFirst).toHaveBeenCalledWith({
        where: { name: 'my-test', branchId: 'br-1' },
        select: { id: true, name: true, kind: true, createdAt: true },
      });
    });

    it('returns null when the branch has no such test', async () => {
      mockClient.unifiedTest.findFirst.mockResolvedValue(null);

      await expect(
        repository.findByBranchAndTestName('br-1', 'missing'),
      ).resolves.toBeNull();
    });
  });

  describe('ensureTest', () => {
    it('upserts the test on the given branch and returns its id', async () => {
      const test = { id: 'test-1', kind: 'image' as TestKind };
      mockClient.unifiedTest.upsert.mockResolvedValue(test);

      const result = await repository.ensureTest(
        'br-1',
        'my-test',
        'image' as TestKind,
      );

      expect(result).toEqual({ testId: 'test-1' });
      expect(mockClient.unifiedTest.upsert).toHaveBeenCalledWith({
        where: { branchId_name: { branchId: 'br-1', name: 'my-test' } },
        create: { branchId: 'br-1', name: 'my-test', kind: 'image' },
        update: {},
      });
    });

    it('allows re-uploading a test whose kind matches', async () => {
      const test = { id: 'test-1', kind: 'image' as TestKind };
      mockClient.unifiedTest.upsert.mockResolvedValue(test);

      const result = await repository.ensureTest(
        'br-1',
        'my-test',
        'image' as TestKind,
      );

      expect(result).toEqual({ testId: 'test-1' });
    });

    it('rejects an upload whose kind conflicts with the persisted test kind', async () => {
      const test = { id: 'test-1', kind: 'image' as TestKind };
      mockClient.unifiedTest.upsert.mockResolvedValue(test);

      await expect(
        repository.ensureTest('br-1', 'my-test', 'pdf' as TestKind),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });
});
