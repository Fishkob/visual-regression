import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ProjectReadRepository } from '@public/visualTest/catalog/infrastructure/repositories/project-read.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { createMock } from '@test/utils/create-mock';

describe('ProjectReadRepository', () => {
  let repository: ProjectReadRepository;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: any;
  let variants: Mocked<VariantStore>;
  let branchResolver: Mocked<BranchResolver>;

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
    branchResolver = createMock<BranchResolver>();
    branchResolver.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-main',
      branchName: 'main',
      isDefault: true,
      isArchived: false,
    });
    branchResolver.resolveDefaultName.mockResolvedValue('main');
    variants.findProjectVariantPage.mockResolvedValue({ data: [], total: 0 });
    variants.findProjectVariantFilterOptions.mockResolvedValue({
      viewports: [],
      browsers: [],
      environments: [],
      testCount: 0,
      pendingCount: 0,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectReadRepository,
        { provide: PrismaConnection, useValue: mockConnection },
        { provide: VariantStore, useValue: variants },
        { provide: BranchResolver, useValue: branchResolver },
      ],
    }).compile();

    repository = module.get(ProjectReadRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getWithLatestVariantStatuses', () => {
    const project = {
      id: 'proj-1',
      name: 'my-project',
      createdAt: new Date(),
      group: null,
    };

    it('returns the project with its variant page and filter options', async () => {
      const variantRow = {
        testName: 'test-1',
        kind: 'image',
        viewport: '1280x720',
        browser: 'chrome',
        environment: 'production',
        status: 'PENDING_APPROVAL' as const,
        origin: 'branch' as const,
        inheritedFrom: null,
      };
      variants.findProjectVariantPage.mockResolvedValue({
        data: [variantRow],
        total: 1,
      });
      variants.findProjectVariantFilterOptions.mockResolvedValue({
        viewports: ['1280x720'],
        browsers: ['chrome'],
        environments: ['production'],
        testCount: 1,
        pendingCount: 1,
      });
      mockClient.project.findUnique.mockResolvedValue(project);

      const result =
        await repository.getWithLatestVariantStatuses('my-project');

      expect(result).toEqual({
        id: 'proj-1',
        name: 'my-project',
        createdAt: project.createdAt,
        groupId: null,
        groupName: null,
        branchName: 'main',
        defaultBranchName: 'main',
        variants: [variantRow],
        total: 1,
        filterOptions: {
          viewports: ['1280x720'],
          browsers: ['chrome'],
          environments: ['production'],
          testCount: 1,
          pendingCount: 1,
        },
      });
      expect(variants.findProjectVariantPage).toHaveBeenCalledWith(
        'br-main',
        {},
        { skip: 0, take: 50 },
      );
      expect(variants.findProjectVariantFilterOptions).toHaveBeenCalledWith(
        'br-main',
      );
    });

    it('forwards pagination and every server-side filter', async () => {
      mockClient.project.findUnique.mockResolvedValue(project);

      await repository.getWithLatestVariantStatuses(
        'my-project',
        'feature/x',
        { skip: 10, take: 5 },
        {
          q: 'login',
          kind: 'pdf',
          status: 'pending',
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
        },
      );

      expect(variants.findProjectVariantPage).toHaveBeenCalledWith(
        'br-main',
        {
          q: 'login',
          kind: 'pdf',
          status: 'pending',
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
        },
        { skip: 10, take: 5 },
      );
    });

    it('returns null when project does not exist', async () => {
      mockClient.project.findUnique.mockResolvedValue(null);

      const result =
        await repository.getWithLatestVariantStatuses('non-existent');

      expect(result).toBeNull();
      expect(variants.findProjectVariantPage).not.toHaveBeenCalled();
    });
  });

  describe('getAllWithPendingFlag', () => {
    it('returns projects with group, pending count and test count', async () => {
      mockClient.project.findMany.mockResolvedValue([
        {
          id: 'proj-1',
          name: 'a',
          createdAt: new Date(),
          group: { id: 'g1', name: 'Checkout' },
        },
        { id: 'proj-2', name: 'b', createdAt: new Date(), group: null },
      ]);
      mockClient.project.count.mockResolvedValue(2);
      mockClient.$queryRaw
        .mockResolvedValueOnce([
          { projectId: 'proj-1', pendingCount: BigInt(3) },
        ])
        .mockResolvedValueOnce([
          { projectId: 'proj-1', testCount: BigInt(2) },
          { projectId: 'proj-2', testCount: BigInt(1) },
        ]);

      const result = await repository.getAllWithPendingFlag();

      expect(result.data[0]).toMatchObject({
        id: 'proj-1',
        groupId: 'g1',
        groupName: 'Checkout',
        pendingCount: 3,
        testCount: 2,
        hasPendingComparisons: true,
      });
      expect(result.data[1]).toMatchObject({
        id: 'proj-2',
        groupId: null,
        groupName: null,
        pendingCount: 0,
        testCount: 1,
        hasPendingComparisons: false,
      });
      expect(mockClient.project.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: undefined,
        include: { group: { select: { id: true, name: true } } },
      });
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
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
        include: { group: { select: { id: true, name: true } } },
      });
    });

    it('applies the search and group filters in the query, not client-side', async () => {
      mockClient.project.findMany.mockResolvedValue([]);
      mockClient.project.count.mockResolvedValue(0);

      await repository.getAllWithPendingFlag(undefined, {
        q: '  checkout  ',
        groupId: 'unassigned',
      });

      const where = {
        name: { contains: 'checkout', mode: 'insensitive' },
        groupId: null,
      };
      expect(mockClient.project.findMany).toHaveBeenCalledWith({
        where,
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: undefined,
        include: { group: { select: { id: true, name: true } } },
      });
      expect(mockClient.project.count).toHaveBeenCalledWith({ where });
    });
  });

  describe('getTestCounts', () => {
    it('returns distinct test counts per project', async () => {
      mockClient.$queryRaw.mockResolvedValue([
        { projectId: 'proj-1', testCount: BigInt(4) },
      ]);

      await expect(repository.getTestCounts(['proj-1'])).resolves.toEqual([
        { projectId: 'proj-1', testCount: 4 },
      ]);
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
