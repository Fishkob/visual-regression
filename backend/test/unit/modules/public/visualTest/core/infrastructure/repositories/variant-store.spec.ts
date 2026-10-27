import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { createMock } from '@test/utils/create-mock';

describe('VariantStore', () => {
  let store: VariantStore;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      unifiedVariant: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VariantStore,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    store = module.get(VariantStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureVariant', () => {
    it('upserts a variant without baselineId and returns its id', async () => {
      mockClient.unifiedVariant.upsert.mockResolvedValue({ id: 'variant-1' });

      const id = await store.ensureVariant(
        'test-1',
        Variant.fromStrings('1280x720', 'chrome', 'production'),
      );

      expect(id).toBe('variant-1');
      expect(mockClient.unifiedVariant.upsert).toHaveBeenCalledWith({
        where: {
          testId_viewport_browser_environment: {
            testId: 'test-1',
            viewport: '1280x720',
            browser: 'chrome',
            environment: 'production',
          },
        },
        create: {
          testId: 'test-1',
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
        },
        update: {},
        select: { id: true },
      });
    });
  });

  describe('findVariantWithBaseline', () => {
    it('returns baselineId + baseline when variant exists', async () => {
      const baseline = {
        id: 'base-1',
        testId: 'test-1',
        type: 'BASELINE',
        imageHash: 'hash123',
        imageUrl: 'http://example.com/base.png',
        pageCount: null,
        pixelDiffThreshold: 0,
        createdAt: new Date(),
      };
      mockClient.unifiedVariant.findUnique.mockResolvedValue({
        baselineId: 'base-1',
        baseline,
      });

      const result = await store.findVariantWithBaseline(
        'test-1',
        Variant.fromStrings('1280x720', 'chrome', 'production'),
      );

      expect(result).toEqual({ baselineId: 'base-1', baseline });
      expect(mockClient.unifiedVariant.findUnique).toHaveBeenCalledWith({
        where: {
          testId_viewport_browser_environment: {
            testId: 'test-1',
            viewport: '1280x720',
            browser: 'chrome',
            environment: 'production',
          },
        },
        include: { baseline: true },
      });
    });

    it('returns null when variant does not exist', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue(null);

      const result = await store.findVariantWithBaseline(
        'test-1',
        Variant.fromStrings('1280x720', 'chrome', 'production'),
      );

      expect(result).toBeNull();
    });
  });

  describe('findVariantId', () => {
    it('returns the variant id when it exists', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue({ id: 'v-1' });

      const result = await store.findVariantId(
        't',
        Variant.fromStrings('v', 'b', 'e'),
      );

      expect(result).toBe('v-1');
      expect(mockClient.unifiedVariant.findUnique).toHaveBeenCalledWith({
        where: {
          testId_viewport_browser_environment: {
            testId: 't',
            viewport: 'v',
            browser: 'b',
            environment: 'e',
          },
        },
        select: { id: true },
      });
    });

    it('returns null when the variant does not exist', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue(null);

      const result = await store.findVariantId(
        't',
        Variant.fromStrings('v', 'b', 'e'),
      );

      expect(result).toBeNull();
    });
  });

  describe('setBaselineId', () => {
    it('updates baselineId on the variant row', async () => {
      mockClient.unifiedVariant.update.mockResolvedValue(undefined);

      await store.setBaselineId('v-1', 'base-1');

      expect(mockClient.unifiedVariant.update).toHaveBeenCalledWith({
        where: { id: 'v-1' },
        data: { baselineId: 'base-1' },
      });
    });
  });

  describe('findVariantStatusSignalsFor', () => {
    it('maps each variant to its baseline presence and latest reviewable comparison status', async () => {
      mockClient.unifiedVariant.findMany.mockResolvedValue([
        {
          test: { name: 'test-1', kind: 'image' },
          baseline: {
            asBaselineComp: [{ status: 'PENDING_APPROVAL' }],
          },
        },
        { test: { name: 'test-1', kind: 'image' }, baseline: null },
        {
          test: { name: 'test-1', kind: 'image' },
          baseline: {
            asBaselineComp: [{ status: 'APPROVED' }],
          },
        },
      ]);

      const result = await store.findVariantStatusSignalsFor({
        testId: 'test-1',
      });

      expect(mockClient.unifiedVariant.findMany).toHaveBeenCalledWith({
        where: { testId: 'test-1' },
        orderBy: { viewport: 'asc' },
        include: {
          test: { select: { name: true, kind: true } },
          baseline: {
            select: {
              id: true,
              asBaselineComp: {
                where: { status: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 1,
                select: { status: true },
              },
            },
          },
        },
      });
      expect(result).toEqual([
        expect.objectContaining({
          testName: 'test-1',
          testKind: 'image',
          hasBaseline: true,
          latestComparisonStatus: 'PENDING_APPROVAL',
        }),
        expect.objectContaining({
          hasBaseline: false,
          latestComparisonStatus: null,
        }),
        expect.objectContaining({
          hasBaseline: true,
          latestComparisonStatus: 'APPROVED',
        }),
      ]);
    });

    it('reports a baseline without any reviewable comparison as null status', async () => {
      mockClient.unifiedVariant.findMany.mockResolvedValue([
        {
          test: { name: 'test-1', kind: 'image' },
          baseline: { asBaselineComp: [] },
        },
      ]);

      const result = await store.findVariantStatusSignalsFor({
        testId: 'test-1',
      });

      expect(result).toEqual([
        expect.objectContaining({
          hasBaseline: true,
          latestComparisonStatus: null,
        }),
      ]);
    });

    it('returns an empty array when the test has no variants', async () => {
      mockClient.unifiedVariant.findMany.mockResolvedValue([]);

      const result = await store.findVariantStatusSignalsFor({
        testId: 'test-1',
      });

      expect(result).toEqual([]);
    });
  });

  describe('findReviewVariantRow', () => {
    it('resolves the variant with its baseline through the shared findFirst rule', async () => {
      const baseline = {
        id: 'base-1',
        testId: 'test-1',
        type: 'BASELINE',
        imageHash: 'hash123',
        imageUrl: 'http://example.com/base.png',
        pageCount: 2,
        pixelDiffThreshold: 0.1,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      };
      mockClient.unifiedVariant.findFirst.mockResolvedValue({
        viewport: '1280x720',
        browser: 'chrome',
        environment: 'production',
        baseline,
      });

      const result = await store.findReviewVariantRow('test-1', {
        viewport: '1280x720',
      });

      expect(mockClient.unifiedVariant.findFirst).toHaveBeenCalledWith({
        where: { testId: 'test-1', viewport: '1280x720' },
        orderBy: [{ viewport: 'asc' }, { id: 'asc' }],
        include: { baseline: true },
      });
      expect(result).toEqual({
        variant: {
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
          baseline: {
            id: 'base-1',
            testId: 'test-1',
            type: 'BASELINE',
            imageHash: 'hash123',
            imageUrl: 'http://example.com/base.png',
            pageCount: 2,
            pixelDiffThreshold: 0.1,
            createdAt: baseline.createdAt,
          },
        },
        hasAnyVariant: true,
      });
    });

    it('reports a null baseline when the resolved variant has none yet', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue({
        viewport: '1280x720',
        browser: 'chrome',
        environment: 'production',
        baseline: null,
      });

      const result = await store.findReviewVariantRow('test-1');

      expect(result).toEqual({
        variant: {
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
          baseline: null,
        },
        hasAnyVariant: true,
      });
    });

    it('distinguishes no matching variant from no variants at all', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValueOnce(null);
      mockClient.unifiedVariant.findFirst.mockResolvedValueOnce({ id: 'v-1' });

      const result = await store.findReviewVariantRow('test-1', {
        viewport: '999x999',
      });

      expect(mockClient.unifiedVariant.findFirst).toHaveBeenLastCalledWith({
        where: { testId: 'test-1' },
        select: { id: true },
      });
      expect(result).toEqual({ variant: null, hasAnyVariant: true });
    });

    it('reports hasAnyVariant false when the test has no variants at all', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValueOnce(null);
      mockClient.unifiedVariant.findFirst.mockResolvedValueOnce(null);

      const result = await store.findReviewVariantRow('test-1', {
        viewport: '999x999',
      });

      expect(result).toEqual({ variant: null, hasAnyVariant: false });
    });
  });

  describe('deleteMany', () => {
    it('deletes the given variant rows', async () => {
      mockClient.unifiedVariant.deleteMany.mockResolvedValue({ count: 2 });

      await store.deleteMany(['v-1', 'v-2']);

      expect(mockClient.unifiedVariant.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['v-1', 'v-2'] } },
      });
    });

    it('skips the write for an empty id list', async () => {
      await store.deleteMany([]);

      expect(mockClient.unifiedVariant.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('variant-filter resolution', () => {
    it('resolves a partial filter to exactly one variant, matching the read seam', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue({
        id: 'variant-chrome',
      });

      const result = await store.findIdsByFilters('test-1', {
        viewport: '1280x720',
      });

      expect(mockClient.unifiedVariant.findFirst).toHaveBeenCalledWith({
        where: { testId: 'test-1', viewport: '1280x720' },
        orderBy: [{ viewport: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      expect(result).toEqual(['variant-chrome']);
    });

    it('returns all variant ids when no filters are given', async () => {
      mockClient.unifiedVariant.findMany.mockResolvedValue([
        { id: 'v-1' },
        { id: 'v-2' },
      ]);

      const result = await store.findIdsByFilters('test-1');

      expect(result).toEqual(['v-1', 'v-2']);
    });

    it('returns the baseline of the single resolved variant for a partial filter', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue({ id: 'v-1' });
      mockClient.unifiedVariant.findMany.mockResolvedValue([
        { baselineId: 'baseline-1' },
      ]);

      const result = await store.findVariantBaselineIds('test-1', {
        viewport: '1280x720',
      });

      expect(result).toEqual(['baseline-1']);
      expect(mockClient.unifiedVariant.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['v-1'] } },
        select: { baselineId: true },
      });
    });

    it('returns every baseline when no filters are given', async () => {
      mockClient.unifiedVariant.findMany.mockResolvedValue([
        { baselineId: 'b1' },
        { baselineId: 'b2' },
        { baselineId: null },
      ]);

      const result = await store.findVariantBaselineIds('test-1');

      expect(result).toEqual(['b1', 'b2']);
    });

    it('returns an empty array without querying when the filter resolves no variants', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue(null);

      const result = await store.findVariantBaselineIds('test-1', {
        viewport: '999x999',
      });

      expect(result).toEqual([]);
      expect(mockClient.unifiedVariant.findMany).not.toHaveBeenCalled();
    });
  });
});
