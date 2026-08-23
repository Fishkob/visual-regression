import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { DomainError } from '@common/domain/domain-error';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { createMock } from '@test/utils/create-mock';

describe('UnifiedComparisonsRepository', () => {
  let repository: UnifiedComparisonsRepository;
  let mockTxCtx: jest.Mocked<TransactionContext>;
  let mockClient: any;
  const now = new Date('2025-01-01T00:00:00Z');

  beforeEach(async () => {
    mockClient = {
      unifiedComparison: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      unifiedScreenshot: {
        delete: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      unifiedVariant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedComparisonsRepository,
        VariantStore,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(UnifiedComparisonsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

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

  describe('findByIdForTest', () => {
    it('returns the comparison by id scoped to the test', async () => {
      const comparison = prismaComparison({
        baseline: prismaBaseline(),
        candidate: prismaCandidate(),
      });
      mockClient.unifiedComparison.findFirst.mockResolvedValue(comparison);

      const result = await repository.findByIdForTest('test-1', 'comp-1');

      expect(mockClient.unifiedComparison.findFirst).toHaveBeenCalledWith({
        where: { id: 'comp-1', testId: 'test-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          candidate: true,
          baseline: { include: { asBaseline: true } },
        },
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('comp-1');
    });

    it('returns null when no comparison matches', async () => {
      mockClient.unifiedComparison.findFirst.mockResolvedValue(null);

      const result = await repository.findByIdForTest('test-1', 'comp-1');

      expect(result).toBeNull();
    });
  });

  describe('findPendingForBaselines', () => {
    it('returns only pending comparisons for the given baselines with a narrow select', async () => {
      const comparisons = [
        { id: 'comp-1', mismatchPixelCount: 5 },
        { id: 'comp-2', mismatchPixelCount: 12 },
      ];
      mockClient.unifiedComparison.findMany.mockResolvedValue(comparisons);

      const result = await repository.findPendingForBaselines('test-1', [
        'base-1',
        'base-2',
      ]);

      expect(result).toHaveLength(2);
      expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith({
        where: {
          testId: 'test-1',
          baselineId: { in: ['base-1', 'base-2'] },
          status: 'PENDING_APPROVAL',
        },
        select: { id: true, mismatchPixelCount: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });

    it('returns empty array when no baselines are given', async () => {
      const result = await repository.findPendingForBaselines('test-1', []);

      expect(result).toEqual([]);
      expect(mockClient.unifiedComparison.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findDiffImageUrlsByTestIds', () => {
    it('returns the diff urls of comparisons for the given tests', async () => {
      mockClient.unifiedComparison.findMany.mockResolvedValue([
        {
          diffImageUrl: 'http://storage/a.png',
          diffPdfUrl: 'http://storage/a.pdf',
        },
        { diffImageUrl: '', diffPdfUrl: 'http://storage/b.pdf' },
      ]);

      const result = await repository.findDiffImageUrlsByTestIds([
        'test-1',
        'test-2',
      ]);

      expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith({
        where: { testId: { in: ['test-1', 'test-2'] } },
        select: { diffImageUrl: true, diffPdfUrl: true },
      });
      expect(result).toEqual([
        'http://storage/a.png',
        'http://storage/a.pdf',
        'http://storage/b.pdf',
      ]);
    });

    it('returns an empty array without querying when no test ids are given', async () => {
      const result = await repository.findDiffImageUrlsByTestIds([]);

      expect(result).toEqual([]);
      expect(mockClient.unifiedComparison.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findReferencedDiffUrls', () => {
    it('returns only the given urls that a comparison row references', async () => {
      mockClient.unifiedComparison.findMany.mockResolvedValue([
        { diffImageUrl: 'http://storage/shared.png', diffPdfUrl: null },
        { diffImageUrl: null, diffPdfUrl: 'http://storage/other.pdf' },
      ]);

      const result = await repository.findReferencedDiffUrls([
        'http://storage/shared.png',
        'http://storage/unused.png',
      ]);

      expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              diffImageUrl: {
                in: ['http://storage/shared.png', 'http://storage/unused.png'],
              },
            },
            {
              diffPdfUrl: {
                in: ['http://storage/shared.png', 'http://storage/unused.png'],
              },
            },
          ],
        },
        select: { diffImageUrl: true, diffPdfUrl: true },
      });
      expect(result).toEqual([
        'http://storage/shared.png',
        'http://storage/other.pdf',
      ]);
    });

    it('returns an empty array without querying when no urls are given', async () => {
      const result = await repository.findReferencedDiffUrls([]);

      expect(result).toEqual([]);
      expect(mockClient.unifiedComparison.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deletePendingByIds', () => {
    it('deletes only pending comparisons with the given ids through the guarded cascade', async () => {
      mockClient.unifiedComparison.findMany
        .mockResolvedValueOnce([
          {
            id: 'comp-1',
            diffImageUrl: 'http://storage/diff.png',
            diffPdfUrl: null,
            candidateId: 'cand-1',
          },
        ])
        .mockResolvedValueOnce([]);
      mockClient.unifiedComparison.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repository.deletePendingByIds('test-1', ['comp-1']);

      expect(mockClient.unifiedComparison.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          testId: 'test-1',
          id: { in: ['comp-1'] },
          status: 'PENDING_APPROVAL',
        },
        select: {
          id: true,
          diffImageUrl: true,
          diffPdfUrl: true,
          candidateId: true,
        },
      });
      expect(mockClient.unifiedComparison.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['comp-1'] } },
      });
      expect(result).toEqual({
        staleDiffUrls: ['http://storage/diff.png'],
        candidateIds: ['cand-1'],
      });
    });

    it('returns empty results without querying when no ids are given', async () => {
      const result = await repository.deletePendingByIds('test-1', []);

      expect(result).toEqual({ staleDiffUrls: [], candidateIds: [] });
      expect(mockClient.unifiedComparison.findMany).not.toHaveBeenCalled();
      expect(mockClient.unifiedComparison.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('findLatestReviewableUrlsByBaselineId', () => {
    it('returns only the candidate and diff urls with the reviewable status set', async () => {
      mockClient.unifiedComparison.findFirst.mockResolvedValue({
        diffPdfUrl: 'http://example.com/diff.pdf',
        candidate: { imageUrl: 'http://example.com/candidate.pdf' },
      });

      const result =
        await repository.findLatestReviewableUrlsByBaselineId('base-1');

      expect(result).toEqual({
        candidateUrl: 'http://example.com/candidate.pdf',
        diffPdfUrl: 'http://example.com/diff.pdf',
      });
      expect(mockClient.unifiedComparison.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            baselineId: 'base-1',
            status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
          },
          select: {
            diffPdfUrl: true,
            candidate: { select: { imageUrl: true } },
          },
        }),
      );
    });

    it('returns null urls when no reviewable comparison exists', async () => {
      mockClient.unifiedComparison.findFirst.mockResolvedValue(null);

      const result =
        await repository.findLatestReviewableUrlsByBaselineId('base-1');

      expect(result).toEqual({
        candidateUrl: null,
        diffPdfUrl: null,
      });
    });

    it('returns a null candidate url when the comparison has no candidate row', async () => {
      mockClient.unifiedComparison.findFirst.mockResolvedValue({
        diffPdfUrl: null,
        candidate: null,
      });

      const result =
        await repository.findLatestReviewableUrlsByBaselineId('base-1');

      expect(result).toEqual({
        candidateUrl: null,
        diffPdfUrl: null,
      });
    });
  });

  describe('createPending', () => {
    it('creates a pending comparison row', async () => {
      mockClient.unifiedComparison.create.mockResolvedValue({
        id: 'comp-1',
      });

      const result = await repository.createPending({
        testId: 'test-1',
        baselineId: 'baseline-1',
        candidateId: 'cand-1',
        diffUrl: 'http://storage/diff.png',
        result: {
          kind: 'image',
          mismatchPixelCount: 10,
          diffOutput: Buffer.from('diff'),
        },
      });

      expect(result).toEqual({ id: 'comp-1' });
      expect(mockClient.unifiedComparison.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          testId: 'test-1',
          baselineId: 'baseline-1',
          candidateId: 'cand-1',
          mismatchPixelCount: 10,
          diffImageUrl: 'http://storage/diff.png',
          mismatchPageCount: 0,
          diffPdfUrl: null,
          pageCount: null,
          status: ComparisonStatus.PENDING_APPROVAL,
        }),
        select: { id: true },
      });
    });

    it('maps a pdf comparison to the row columns', async () => {
      mockClient.unifiedComparison.create.mockResolvedValue({
        id: 'comp-1',
      });

      await repository.createPending({
        testId: 'test-1',
        baselineId: 'baseline-1',
        candidateId: 'cand-1',
        diffUrl: 'http://storage/diff.pdf',
        result: {
          kind: 'pdf',
          mismatchPageCount: 2,
          diffOutput: Buffer.from('diff-pdf'),
          pageCount: 4,
        },
      });

      expect(mockClient.unifiedComparison.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          mismatchPixelCount: 0,
          diffImageUrl: null,
          mismatchPageCount: 2,
          diffPdfUrl: 'http://storage/diff.pdf',
          pageCount: 4,
          status: ComparisonStatus.PENDING_APPROVAL,
        }),
        select: { id: true },
      });
    });
  });

  describe('completeImageApproval', () => {
    it('deletes a pending comparison and returns its diff artifact urls', async () => {
      mockClient.unifiedComparison.findUnique.mockResolvedValue({
        id: 'comp-1',
        testId: 'test-1',
        diffImageUrl: 'http://storage/diff.png',
      });
      mockClient.unifiedComparison.deleteMany.mockResolvedValue({ count: 1 });

      const urls = await repository.completeImageApproval('test-1', 'comp-1');

      expect(urls).toEqual(['http://storage/diff.png']);
      expect(mockClient.unifiedComparison.findUnique).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        select: { id: true, testId: true, diffImageUrl: true },
      });
      expect(mockClient.unifiedComparison.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'comp-1',
          testId: 'test-1',
          status: 'PENDING_APPROVAL',
        },
      });
    });

    it('returns no urls when the comparison has no diff image', async () => {
      mockClient.unifiedComparison.findUnique.mockResolvedValue({
        id: 'comp-1',
        testId: 'test-1',
        diffImageUrl: null,
      });
      mockClient.unifiedComparison.deleteMany.mockResolvedValue({ count: 1 });

      const urls = await repository.completeImageApproval('test-1', 'comp-1');

      expect(urls).toEqual([]);
    });

    it('throws DomainError when comparison not found', async () => {
      mockClient.unifiedComparison.findUnique.mockResolvedValue(null);

      await expect(
        repository.completeImageApproval('test-1', 'non-existent'),
      ).rejects.toThrow(DomainError);
      await expect(
        repository.completeImageApproval('test-1', 'non-existent'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mockClient.unifiedComparison.deleteMany).not.toHaveBeenCalled();
    });

    it('throws DomainError when the comparison belongs to another test', async () => {
      mockClient.unifiedComparison.findUnique.mockResolvedValue({
        id: 'comp-1',
        testId: 'other-test',
        diffImageUrl: null,
      });

      await expect(
        repository.completeImageApproval('test-1', 'comp-1'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mockClient.unifiedComparison.deleteMany).not.toHaveBeenCalled();
    });

    it('throws CONFLICT when a concurrent approval deleted the pending comparison between read and write', async () => {
      mockClient.unifiedComparison.findUnique.mockResolvedValue({
        id: 'comp-1',
        testId: 'test-1',
        diffImageUrl: null,
      });
      mockClient.unifiedComparison.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.completeImageApproval('test-1', 'comp-1'),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('retirePendingForVariant', () => {
    const variant = Variant.fromStrings('1920x1080', 'chrome', 'staging');

    it('deletes every pending comparison for the variant and returns stale diff urls + candidate ids', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue({
        id: 'variant-1',
        baselineId: 'baseline-1',
      });
      mockClient.unifiedComparison.findMany
        .mockResolvedValueOnce([
          {
            id: 'comp-1',
            diffImageUrl: 'http://storage/diff.png',
            diffPdfUrl: 'http://storage/diff.pdf',
            candidateId: 'cand-1',
          },
        ])
        .mockResolvedValueOnce([]);
      mockClient.unifiedComparison.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repository.retirePendingForVariant(
        'test-1',
        variant,
      );

      expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith({
        where: {
          testId: 'test-1',
          baselineId: 'baseline-1',
          status: ComparisonStatus.PENDING_APPROVAL,
        },
        select: {
          id: true,
          diffImageUrl: true,
          diffPdfUrl: true,
          candidateId: true,
        },
      });
      expect(result).toEqual({
        staleDiffUrls: ['http://storage/diff.png', 'http://storage/diff.pdf'],
        candidateIds: ['cand-1'],
      });
      expect(mockClient.unifiedComparison.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['comp-1'] } },
      });
    });

    it('keeps the freshly created comparison when keepComparisonId is provided', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue({
        id: 'variant-1',
        baselineId: 'baseline-1',
      });
      mockClient.unifiedComparison.findMany.mockResolvedValue([]);

      const result = await repository.retirePendingForVariant(
        'test-1',
        variant,
        'comp-keep',
      );

      expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith({
        where: {
          testId: 'test-1',
          baselineId: 'baseline-1',
          NOT: { id: 'comp-keep' },
          status: ComparisonStatus.PENDING_APPROVAL,
        },
        select: {
          id: true,
          diffImageUrl: true,
          diffPdfUrl: true,
          candidateId: true,
        },
      });
      expect(result).toEqual({ staleDiffUrls: [], candidateIds: [] });
    });

    it('deletes no comparisons when the variant has no baseline', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue({
        id: 'variant-1',
        baselineId: null,
      });

      const result = await repository.retirePendingForVariant(
        'test-1',
        variant,
      );

      expect(result).toEqual({ staleDiffUrls: [], candidateIds: [] });
      expect(mockClient.unifiedComparison.findMany).not.toHaveBeenCalled();
      expect(mockClient.unifiedComparison.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('completePdfApproval', () => {
    it('atomically updates comparison status to APPROVED when pending', async () => {
      mockClient.unifiedComparison.updateMany.mockResolvedValue({ count: 1 });

      const urls = await repository.completePdfApproval('comp-1');

      expect(urls).toEqual([]);
      expect(mockClient.unifiedComparison.updateMany).toHaveBeenCalledWith({
        where: { id: 'comp-1', status: 'PENDING_APPROVAL' },
        data: { status: 'APPROVED', candidateId: null },
      });
    });

    it('clears the diff reference and returns its url when provided', async () => {
      mockClient.unifiedComparison.updateMany.mockResolvedValue({ count: 1 });

      const urls = await repository.completePdfApproval(
        'comp-1',
        'http://storage/diff.pdf',
      );

      expect(urls).toEqual(['http://storage/diff.pdf']);
      expect(mockClient.unifiedComparison.updateMany).toHaveBeenCalledWith({
        where: { id: 'comp-1', status: 'PENDING_APPROVAL' },
        data: {
          status: 'APPROVED',
          candidateId: null,
          diffPdfUrl: null,
        },
      });
    });

    it('throws CONFLICT when comparison is not pending', async () => {
      mockClient.unifiedComparison.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.completePdfApproval('comp-1'),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('deleteComparisonsForScreenshots', () => {
    it('deletes comparisons referencing the screenshots through the guarded cascade and returns candidate ids', async () => {
      mockClient.unifiedComparison.findMany
        .mockResolvedValueOnce([
          {
            id: 'comp-1',
            diffImageUrl: 'http://storage/diff.png',
            diffPdfUrl: null,
            candidateId: 'ss-2',
          },
        ])
        .mockResolvedValueOnce([]);
      mockClient.unifiedComparison.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repository.deleteComparisonsForScreenshots(
        'test-1',
        ['ss-1', 'ss-2'],
      );

      expect(mockClient.unifiedComparison.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          testId: 'test-1',
          OR: [
            { baselineId: { in: ['ss-1', 'ss-2'] } },
            { candidateId: { in: ['ss-1', 'ss-2'] } },
          ],
        },
        select: {
          id: true,
          diffImageUrl: true,
          diffPdfUrl: true,
          candidateId: true,
        },
      });
      expect(mockClient.unifiedComparison.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['comp-1'] } },
      });
      expect(result).toEqual({
        staleDiffUrls: ['http://storage/diff.png'],
        candidateIds: ['ss-2'],
      });
    });

    it('returns empty results when no screenshot ids provided', async () => {
      const result = await repository.deleteComparisonsForScreenshots(
        'test-1',
        [],
      );

      expect(result).toEqual({ staleDiffUrls: [], candidateIds: [] });
      expect(mockClient.unifiedComparison.findMany).not.toHaveBeenCalled();
      expect(mockClient.unifiedComparison.deleteMany).not.toHaveBeenCalled();
    });
  });
});
