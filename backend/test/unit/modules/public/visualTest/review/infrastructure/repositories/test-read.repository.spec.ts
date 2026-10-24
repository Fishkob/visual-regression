import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchTestRepository } from '@public/visualTest/core/infrastructure/repositories/branch-test.repository';
import type { TestKind, TestStatus } from '@/prisma/client';
import { createMock } from '@test/utils/create-mock';
import { DomainError } from '@common/domain/domain-error';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { REVIEWABLE_COMPARISON_STATUS_FILTER } from '@public/visualTest/core/domain/types/visual-test.types';
import {
  toComparisonEntityWithRelations,
  type ComparisonRow,
} from '@public/visualTest/core/infrastructure/mappers/comparison.mapper';

describe('TestReadRepository', () => {
  let repository: TestReadRepository;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: any;
  let variants: Mocked<VariantStore>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let branches: Mocked<BranchResolver>;
  let branchTests: Mocked<BranchTestRepository>;
  const now = new Date('2025-01-01T00:00:00Z');

  function baselineRow(overrides: Record<string, unknown> = {}): any {
    return {
      id: 'base-1',
      testId: 'test-1',
      type: 'BASELINE',
      imageHash: 'abc123',
      imageUrl: 'http://example.com/base.png',
      pageCount: null,
      pixelDiffThreshold: 0,
      createdAt: now,
      asBaseline: {
        viewport: '1280x720',
        browser: 'chrome',
        environment: 'production',
      },
      ...overrides,
    };
  }

  function candidateRow(overrides: Record<string, unknown> = {}): any {
    return {
      id: 'cand-1',
      testId: 'test-1',
      type: 'CURRENT',
      imageHash: 'def456',
      imageUrl: 'http://example.com/current.png',
      pageCount: null,
      pixelDiffThreshold: 0,
      createdAt: now,
      ...overrides,
    };
  }

  // The COMPARISON_INCLUDE shape `findLatestReviewableByBaselineId` maps to a
  // ComparisonEntity: the row carries its own baseline/candidate/test relations.
  function comparisonRow(overrides: Record<string, unknown> = {}): any {
    return {
      id: 'comp-1',
      testId: 'test-1',
      mismatchPixelCount: 10,
      mismatchPageCount: 0,
      pageCount: null,
      diffImageUrl: 'http://example.com/diff.png',
      diffPdfUrl: null,
      status: ComparisonStatus.PENDING_APPROVAL,
      baselineId: 'base-1',
      candidateId: 'cand-1',
      createdAt: now,
      baseline: baselineRow(),
      candidate: candidateRow(),
      test: { kind: 'pdf' },
      ...overrides,
    };
  }

  beforeEach(async () => {
    mockClient = {
      project: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      unifiedTest: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      unifiedVariant: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      unifiedComparison: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
      },
      unifiedScreenshot: {
        count: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', {
      get: () => mockClient,
    });
    variants = createMock<VariantStore>();
    comparisons = createMock<UnifiedComparisonsRepository>();
    branches = createMock<BranchResolver>();
    branches.resolveRead.mockImplementation(async (projectName: string) => ({
      projectId: `proj-${projectName}`,
      branchId: `br-${projectName}`,
      branchName: 'main',
      isDefault: true,
      isArchived: false,
    }));
    branchTests = createMock<BranchTestRepository>();
    // Delegate the effective-test lookup to the same project.findUnique shape
    // the tests mock, so existing "project + unifiedTests" setups keep working.
    branchTests.findEffectiveTest.mockImplementation(
      async (branchId: string, testName: string) => {
        const projectName = branchId.replace(/^br-/, '');
        const project = await mockClient.project.findUnique({
          where: { name: projectName },
          include: {
            unifiedTests: { where: { name: testName }, take: 1 },
          },
        });
        if (project === null) return null;
        const defaultTest = {
          id: 'test-1',
          name: testName,
          kind: 'pdf',
          status: 'PENDING',
          createdAt: now,
        };
        const test =
          project?.unifiedTests === undefined
            ? defaultTest
            : project.unifiedTests[0];
        return test
          ? {
              id: test.id,
              name: test.name,
              kind: test.kind,
              status: test.status ?? 'PENDING',
              createdAt: test.createdAt,
              origin: 'branch',
              inheritedFrom: null,
            }
          : null;
      },
    );
    variants.findReviewVariantRow.mockImplementation(
      async (testId: string, filters?: unknown) => {
        const variant = await mockClient.unifiedVariant.findFirst({
          where: {
            testId,
            ...(filters as Record<string, unknown> | undefined),
          },
          include: { baseline: true },
        });
        if (variant) return { variant, hasAnyVariant: true };
        const any = await mockClient.unifiedVariant.findFirst({
          where: { testId },
          select: { id: true },
        });
        return { variant: null, hasAnyVariant: Boolean(any) };
      },
    );
    comparisons.findLatestReviewableByBaselineId.mockImplementation(
      async (baselineId: string) => {
        const result = await mockClient.unifiedComparison.findFirst({
          where: { baselineId, ...REVIEWABLE_COMPARISON_STATUS_FILTER },
        });
        if (!result) return null;
        return toComparisonEntityWithRelations(result as ComparisonRow);
      },
    );
    comparisons.findLatestReviewableUrlsByBaselineId.mockImplementation(
      async (baselineId: string) => {
        const result = await mockClient.unifiedComparison.findFirst({
          where: { baselineId, ...REVIEWABLE_COMPARISON_STATUS_FILTER },
        });
        return {
          candidateUrl: result?.candidate?.imageUrl ?? null,
          diffPdfUrl: result?.diffPdfUrl ?? null,
        };
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestReadRepository,
        { provide: PrismaConnection, useValue: mockConnection },
        { provide: VariantStore, useValue: variants },
        { provide: UnifiedComparisonsRepository, useValue: comparisons },
        { provide: BranchResolver, useValue: branches },
        { provide: BranchTestRepository, useValue: branchTests },
      ],
    }).compile();

    repository = module.get(TestReadRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTestNames', () => {
    function effectiveTest(overrides: Record<string, unknown> = {}) {
      return {
        id: 'test-1',
        name: 'test-1',
        kind: 'image' as TestKind,
        status: 'PENDING_APPROVAL' as TestStatus,
        createdAt: now,
        origin: 'branch' as const,
        inheritedFrom: null,
        ...overrides,
      };
    }

    it('returns effective tests with their origin for the branch id', async () => {
      branchTests.findEffectiveTests.mockResolvedValue({
        data: [effectiveTest()],
        total: 1,
      });

      const result = await repository.getTestNames('br-1');

      expect(result).toEqual({
        data: [
          {
            name: 'test-1',
            kind: 'image',
            status: 'PENDING_APPROVAL',
            origin: 'branch',
            inheritedFrom: null,
          },
        ],
        total: 1,
      });
      expect(branchTests.findEffectiveTests).toHaveBeenCalledWith(
        'br-1',
        undefined,
        undefined,
      );
    });

    it('tags inherited tests with the ancestor branch name', async () => {
      branchTests.findEffectiveTests.mockResolvedValue({
        data: [
          effectiveTest({
            id: 'test-main',
            origin: 'inherited',
            inheritedFrom: 'main',
          }),
        ],
        total: 1,
      });

      const result = await repository.getTestNames('br-1');

      expect(result.data[0]).toMatchObject({
        origin: 'inherited',
        inheritedFrom: 'main',
      });
    });

    it('filters by kind when provided', async () => {
      branchTests.findEffectiveTests.mockResolvedValue({ data: [], total: 0 });

      await repository.getTestNames('br-1', undefined, 'pdf');

      expect(branchTests.findEffectiveTests).toHaveBeenCalledWith(
        'br-1',
        undefined,
        'pdf',
      );
    });

    it('applies pagination', async () => {
      branchTests.findEffectiveTests.mockResolvedValue({ data: [], total: 20 });

      await repository.getTestNames('br-1', { skip: 5, take: 5 });

      expect(branchTests.findEffectiveTests).toHaveBeenCalledWith(
        'br-1',
        { skip: 5, take: 5 },
        undefined,
      );
    });
  });

  describe('findTestWithVariants', () => {
    const project = { id: 'proj-1', name: 'my-project' };
    const test = {
      id: 'test-1',
      name: 'my-test',
      status: 'PENDING' as TestStatus,
      kind: 'pdf' as TestKind,
      createdAt: now,
    };
    const variant = {
      id: 'var-1',
      viewport: '1280x720',
      browser: 'chrome',
      environment: 'production',
      baselineId: 'base-1',
      baseline: {
        id: 'base-1',
        testId: 'test-1',
        type: 'BASELINE',
        imageUrl: 'http://example.com/base.png',
        imageHash: 'abc123',
        pageCount: null,
        pixelDiffThreshold: 0,
        createdAt: now,
      },
    };

    const variantVo = Variant.fromStrings('1280x720', 'chrome', 'production');

    it('returns test with baseline and pending comparison as entities', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue(variant);
      mockClient.unifiedComparison.findFirst.mockResolvedValue(comparisonRow());

      const result = await repository.findTestWithVariants(
        'my-project',
        'my-test',
      );

      expect(result).not.toBeNull();
      expect(result!.test).toEqual({
        id: 'test-1',
        name: 'my-test',
        status: 'PENDING_APPROVAL',
        kind: 'pdf',
        createdAt: now,
        origin: 'branch',
        inheritedFrom: null,
      });
      expect(result!.baseline).not.toBeNull();
      expect(result!.baseline!.id).toBe('base-1');
      expect(result!.baseline!.imageUrl).toBe('http://example.com/base.png');
      expect(result!.baseline!.imageHash).toBe('abc123');
      expect(result!.baseline!.viewport).toBe('1280x720');
      expect(result!.baseline!.browser).toBe('chrome');
      expect(result!.baseline!.environment).toBe('production');
      expect(mockClient.unifiedComparison.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            baselineId: 'base-1',
            status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
          },
        }),
      );
      expect(result!.comparison).not.toBeNull();
      expect(result!.comparison!.status).toBe('PENDING_APPROVAL');
      expect(result!.comparison!.candidate?.imageUrl).toBe(
        'http://example.com/current.png',
      );
      expect(result!.comparison!.diffPdfUrl).toBeUndefined();
    });

    it('builds the comparison with the real variant', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue(variant);
      mockClient.unifiedComparison.findFirst.mockResolvedValue(comparisonRow());

      const result = await repository.findTestWithVariants(
        'my-project',
        'my-test',
      );

      expect(result!.comparison!.baseline?.variant).toEqual(variantVo);
      expect(result!.comparison!.candidate?.variant).toEqual(variantVo);
    });

    it('returns null when project does not exist', async () => {
      mockClient.project.findUnique.mockResolvedValue(null);

      const result = await repository.findTestWithVariants(
        'non-existent',
        'my-test',
      );

      expect(result).toBeNull();
    });

    it('returns null when test does not exist', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [],
      });

      const result = await repository.findTestWithVariants(
        'my-project',
        'non-existent',
      );

      expect(result).toBeNull();
    });

    it('returns test with null baseline and null comparison when no variant', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue(null);

      const result = await repository.findTestWithVariants(
        'my-project',
        'my-test',
      );

      expect(result).not.toBeNull();
      expect(result!.test.id).toBe('test-1');
      expect(result!.baseline).toBeNull();
      expect(result!.comparison).toBeNull();
      expect(mockClient.unifiedComparison.findFirst).not.toHaveBeenCalled();
    });

    it('applies variant filters when provided', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue(null);

      await repository.findTestWithVariants('my-project', 'my-test', {
        viewport: '1280x720',
        browser: 'chrome',
      });

      expect(mockClient.unifiedVariant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            viewport: '1280x720',
            browser: 'chrome',
            testId: 'test-1',
          },
        }),
      );
    });
  });

  describe('findVisualTestDetails', () => {
    const test = {
      id: 'test-1',
      name: 'my-test',
      kind: 'image' as TestKind,
      status: 'PENDING' as TestStatus,
      createdAt: now,
    };
    const baseRow = {
      id: 'base-1',
      testId: 'test-1',
      type: 'BASELINE',
      imageUrl: 'http://example.com/base.png',
      imageHash: 'abc123',
      pageCount: null,
      pixelDiffThreshold: 0,
      createdAt: now,
    };
    const variant = {
      id: 'var-1',
      viewport: '1920x1080',
      browser: 'chrome',
      environment: 'staging',
      baselineId: 'base-1',
      baseline: baseRow,
    };

    it('composes baseline and comparison through the shared variant+baseline resolver', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue(variant);
      mockClient.unifiedComparison.findFirst.mockResolvedValue(comparisonRow());

      const result = await repository.findVisualTestDetails(
        'my-project',
        'my-test',
        { viewport: '1920x1080' },
      );

      expect(mockClient.unifiedVariant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { testId: 'test-1', viewport: '1920x1080' },
        }),
      );
      expect(mockClient.unifiedComparison.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            baselineId: 'base-1',
            status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
          },
        }),
      );
      expect(result).toEqual({
        exists: true,
        origin: 'branch',
        inheritedFrom: null,
        baselineInherited: false,
        inheritTarget: null,
        kind: 'image',
        baseline: expect.objectContaining({
          id: 'base-1',
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
        }),
        comparison: expect.objectContaining({ id: 'comp-1' }),
      });
    });

    it('returns exists false when neither the test nor a baseline exists', async () => {
      mockClient.project.findUnique.mockResolvedValue(null);

      const result = await repository.findVisualTestDetails(
        'my-project',
        'unknown-test',
      );

      expect(mockClient.unifiedComparison.findFirst).not.toHaveBeenCalled();
      expect(mockClient.project.findUnique).toHaveBeenCalledWith({
        where: { name: 'my-project' },
        include: {
          unifiedTests: { where: { name: 'unknown-test' }, take: 1 },
        },
      });
      expect(result).toEqual({
        exists: false,
        kind: undefined,
        baseline: null,
        comparison: null,
      });
    });

    it('returns exists true with no baseline when the test exists but has no baseline yet', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue(null);

      const result = await repository.findVisualTestDetails(
        'my-project',
        'my-test',
      );

      expect(mockClient.unifiedComparison.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual({
        exists: true,
        origin: 'branch',
        inheritedFrom: null,
        baselineInherited: false,
        inheritTarget: null,
        kind: 'image',
        baseline: null,
        comparison: null,
      });
    });

    it('throws variant-not-found when the test has variants but none match the filters', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'var-1' });

      await expect(
        repository.findVisualTestDetails('my-project', 'my-test', {
          viewport: '999x999',
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Variant not found for test "my-test" in project "my-project"',
      });
      expect(mockClient.unifiedComparison.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('findPdfDownloadSources', () => {
    const project = { id: 'proj-1', name: 'my-project' };
    const test = {
      id: 'test-1',
      name: 'my-test',
      status: 'PENDING' as TestStatus,
      kind: 'pdf' as TestKind,
      createdAt: now,
    };

    function variantWithBaseline() {
      return {
        id: 'var-1',
        viewport: '1280x720',
        browser: 'chrome',
        environment: 'production',
        baselineId: 'base-1',
        baseline: {
          id: 'base-1',
          testId: 'test-1',
          type: 'BASELINE',
          imageHash: 'abc123',
          imageUrl: 'http://example.com/base.pdf',
          pageCount: null,
          pixelDiffThreshold: 0,
          createdAt: now,
        },
      };
    }

    it('returns baseline, candidate and diff urls in one read', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue(
        variantWithBaseline(),
      );
      mockClient.unifiedComparison.findFirst.mockResolvedValue(
        comparisonRow({
          diffPdfUrl: 'http://example.com/diff.pdf',
          candidate: candidateRow({
            imageUrl: 'http://example.com/candidate.pdf',
          }),
        }),
      );

      const result = await repository.findPdfDownloadSources(
        'my-project',
        'my-test',
        { viewport: '1280x720' },
      );

      expect(mockClient.unifiedVariant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { testId: 'test-1', viewport: '1280x720' },
        }),
      );
      expect(
        comparisons.findLatestReviewableUrlsByBaselineId,
      ).toHaveBeenCalledWith('base-1');
      expect(result).toEqual({
        baselineUrl: 'http://example.com/base.pdf',
        candidateUrl: 'http://example.com/candidate.pdf',
        diffPdfUrl: 'http://example.com/diff.pdf',
      });
    });

    it('returns nulls for a baseline with no comparison yet', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue(
        variantWithBaseline(),
      );
      mockClient.unifiedComparison.findFirst.mockResolvedValue(null);

      const result = await repository.findPdfDownloadSources(
        'my-project',
        'my-test',
      );

      expect(result).toEqual({
        baselineUrl: 'http://example.com/base.pdf',
        candidateUrl: null,
        diffPdfUrl: null,
      });
    });

    it('returns null when the test does not exist', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [],
      });

      const result = await repository.findPdfDownloadSources(
        'my-project',
        'unknown-test',
      );

      expect(result).toBeNull();
    });

    it('returns null urls when the variant has no baseline', async () => {
      mockClient.project.findUnique.mockResolvedValue({
        ...project,
        unifiedTests: [test],
      });
      mockClient.unifiedVariant.findFirst.mockResolvedValue({
        id: 'var-1',
        baseline: null,
      });

      const result = await repository.findPdfDownloadSources(
        'my-project',
        'my-test',
      );

      expect(result).toEqual({
        baselineUrl: null,
        candidateUrl: null,
        diffPdfUrl: null,
      });
    });
  });

  describe('getPendingApproval', () => {
    function prismaComparison(overrides: Record<string, unknown> = {}) {
      return {
        id: 'comp-1',
        testId: 'test-1',
        mismatchPixelCount: 10,
        mismatchPageCount: null,
        diffImageUrl: 'http://example.com/diff.png',
        diffPdfUrl: null,
        status: 'PENDING_APPROVAL',
        baselineId: 'base-1',
        candidateId: 'cand-1',
        createdAt: now,
        ...overrides,
      };
    }

    function prismaBaseline() {
      return {
        id: 'base-1',
        testId: 'test-1',
        type: 'BASELINE',
        imageHash: 'hash123',
        imageUrl: 'http://example.com/base.png',
        pageCount: null,
        pixelDiffThreshold: 0,
        createdAt: now,
        asBaseline: {
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
        },
      };
    }

    function prismaCandidate() {
      return {
        id: 'cand-1',
        testId: 'test-1',
        type: 'CURRENT',
        imageHash: 'hash456',
        imageUrl: 'http://example.com/current.png',
        pageCount: null,
        pixelDiffThreshold: 0,
        createdAt: now,
      };
    }

    it('returns paginated pending comparisons', async () => {
      const comparisons = [
        prismaComparison({
          test: { name: 'test-1' },
          baseline: prismaBaseline(),
          candidate: prismaCandidate(),
        }),
      ];
      mockClient.unifiedComparison.findMany.mockResolvedValue(comparisons);
      mockClient.unifiedComparison.count.mockResolvedValue(1);

      const result = await repository.getPendingApproval('proj-1');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('test-1');
      expect(result.data[0].variant.viewport).toBe('1280x720');
      expect(result.data[0].latestStatus).toBe('PENDING_APPROVAL');
      expect(result.total).toBe(1);
    });

    it('applies pagination with a stable order', async () => {
      mockClient.unifiedComparison.findMany.mockResolvedValue([]);
      mockClient.unifiedComparison.count.mockResolvedValue(10);

      await repository.getPendingApproval('br-1', { skip: 5, take: 5 });

      expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { test: { branchId: 'br-1' }, status: 'PENDING_APPROVAL' },
        }),
      );
    });

    it('returns empty array when no pending comparisons', async () => {
      mockClient.unifiedComparison.findMany.mockResolvedValue([]);
      mockClient.unifiedComparison.count.mockResolvedValue(0);

      const result = await repository.getPendingApproval('proj-1');

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('assertPdfBelongsToTest', () => {
    it('does not throw when a screenshot matches the test', async () => {
      mockClient.unifiedScreenshot.count.mockResolvedValue(1);

      await expect(
        repository.assertPdfBelongsToTest(
          'my-project',
          'my-test',
          'http://example.com/img.png',
        ),
      ).resolves.toBeUndefined();
    });

    it('does not throw when a comparison diffPdfUrl matches', async () => {
      mockClient.unifiedScreenshot.count.mockResolvedValue(0);
      mockClient.unifiedComparison.count.mockResolvedValue(1);

      await expect(
        repository.assertPdfBelongsToTest(
          'my-project',
          'my-test',
          'http://example.com/diff.pdf',
        ),
      ).resolves.toBeUndefined();
    });

    it('throws when neither screenshot nor comparison matches', async () => {
      mockClient.unifiedScreenshot.count.mockResolvedValue(0);
      mockClient.unifiedComparison.count.mockResolvedValue(0);

      await expect(
        repository.assertPdfBelongsToTest(
          'my-project',
          'my-test',
          'http://example.com/unrelated.png',
        ),
      ).rejects.toThrow(DomainError);
    });
  });
});
