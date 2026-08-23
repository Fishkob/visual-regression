import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { createMock } from '@test/utils/create-mock';

describe('ProjectReadRepository', () => {
  let repository: ProjectReadRepository;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: any;
  let variants: Mocked<VariantStore>;

  beforeEach(async () => {
    mockClient = {
      project: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', {
      get: () => mockClient,
    });
    variants = createMock<VariantStore>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectReadRepository,
        { provide: PrismaConnection, useValue: mockConnection },
        { provide: VariantStore, useValue: variants },
      ],
    }).compile();

    repository = module.get(ProjectReadRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getWithLatestVariantStatuses', () => {
    const project = { id: 'proj-1', name: 'my-project', createdAt: new Date() };

    it('returns project with variants and latest comparison status', async () => {
      variants.findVariantStatusSignalsFor.mockResolvedValue([
        {
          testName: 'test-1',
          testKind: 'image',
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
          hasBaseline: true,
          latestComparisonStatus: 'PENDING_APPROVAL',
        },
      ]);
      mockClient.project.findUnique.mockResolvedValue(project);

      const result =
        await repository.getWithLatestVariantStatuses('my-project');

      expect(result).toEqual({
        id: 'proj-1',
        name: 'my-project',
        createdAt: project.createdAt,
        variants: [
          {
            testName: 'test-1',
            kind: 'image',
            viewport: '1280x720',
            browser: 'chrome',
            environment: 'production',
            status: 'PENDING_APPROVAL',
          },
        ],
      });
      expect(variants.findVariantStatusSignalsFor).toHaveBeenCalledWith({
        test: { project: { name: 'my-project' } },
      });
    });

    it('returns null when project does not exist', async () => {
      mockClient.project.findUnique.mockResolvedValue(null);

      const result =
        await repository.getWithLatestVariantStatuses('non-existent');

      expect(result).toBeNull();
      expect(variants.findVariantStatusSignalsFor).not.toHaveBeenCalled();
    });

    it('reports PENDING for a variant with no baseline', async () => {
      variants.findVariantStatusSignalsFor.mockResolvedValue([
        {
          testName: 'test-1',
          testKind: 'image',
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
          hasBaseline: false,
          latestComparisonStatus: null,
        },
      ]);
      mockClient.project.findUnique.mockResolvedValue(project);

      const result =
        await repository.getWithLatestVariantStatuses('my-project');

      expect(result!.variants[0].status).toBe('PENDING');
    });

    it('reports UNCHANGED for a variant with a baseline but no comparison', async () => {
      variants.findVariantStatusSignalsFor.mockResolvedValue([
        {
          testName: 'test-1',
          testKind: 'image',
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
          hasBaseline: true,
          latestComparisonStatus: null,
        },
      ]);
      mockClient.project.findUnique.mockResolvedValue(project);

      const result =
        await repository.getWithLatestVariantStatuses('my-project');

      expect(result!.variants[0].status).toBe('UNCHANGED');
    });
  });

  describe('getAllWithPendingFlag', () => {
    it('returns projects with hasPendingComparison flag', async () => {
      const projects = [
        { id: 'proj-1', name: 'a', createdAt: new Date() },
        { id: 'proj-2', name: 'b', createdAt: new Date() },
      ];
      mockClient.project.findMany.mockResolvedValue(projects);
      mockClient.project.count.mockResolvedValue(2);
      mockClient.$queryRaw.mockResolvedValue([
        { projectId: 'proj-1', pendingCount: BigInt(3) },
      ]);

      const result = await repository.getAllWithPendingFlag();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].hasPendingComparisons).toBe(true);
      expect(result.data[1].hasPendingComparisons).toBe(false);
      expect(result.total).toBe(2);
      expect(mockClient.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('returns empty when no projects exist', async () => {
      mockClient.project.findMany.mockResolvedValue([]);
      mockClient.project.count.mockResolvedValue(0);

      const result = await repository.getAllWithPendingFlag();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('applies pagination', async () => {
      mockClient.project.findMany.mockResolvedValue([]);
      mockClient.project.count.mockResolvedValue(10);

      await repository.getAllWithPendingFlag({ skip: 5, take: 5 });

      expect(mockClient.project.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      });
    });
  });

  describe('getPendingCounts', () => {
    it('returns pending counts per project from raw query', async () => {
      mockClient.$queryRaw.mockResolvedValue([
        { projectId: 'proj-1', pendingCount: BigInt(5) },
        { projectId: 'proj-2', pendingCount: BigInt(2) },
      ]);

      const result = await repository.getPendingCounts();

      expect(result).toEqual([
        { projectId: 'proj-1', pendingCount: 5 },
        { projectId: 'proj-2', pendingCount: 2 },
      ]);
      expect(mockClient.$queryRaw).toHaveBeenCalled();
    });

    it('returns empty array when no pending comparisons', async () => {
      mockClient.$queryRaw.mockResolvedValue([]);

      const result = await repository.getPendingCounts();

      expect(result).toEqual([]);
    });
  });
});
