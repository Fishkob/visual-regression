import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    unifiedScreenshot: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    unifiedVariant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    unifiedTest: {
      findUnique: vi.fn(),
    },
    unifiedComparison: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    baselineRevision: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('UnifiedScreenshotRepository', () => {
  let repository: UnifiedScreenshotRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;
  const now = new Date('2025-01-01T00:00:00Z');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mockClient = makeMockClient();

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedScreenshotRepository,
        VariantStore,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(UnifiedScreenshotRepository);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const variant = Variant.fromStrings('1280x720', 'chrome', 'production');

  function prismaScreenshot(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ss-1',
      testId: 'test-1',
      type: 'BASELINE',
      imageHash: 'hash123',
      imageUrl: 'http://example.com/img.png',
      pageCount: null,
      pixelDiffThreshold: 0,
      createdAt: now,
      ...overrides,
    };
  }

  describe('findBaselineByVariant', () => {
    it('returns screenshot entity when variant has baseline', async () => {
      const v = {
        baseline: {
          id: 'base-1',
          testId: 'test-1',
          type: 'BASELINE',
          imageHash: 'hash123',
          imageUrl: 'http://example.com/base.png',
          pageCount: null,
          pixelDiffThreshold: 0,
          createdAt: now,
        },
      };
      mockClient.unifiedVariant.findUnique.mockResolvedValue(v);

      const result = await repository.findBaselineByVariant('test-1', variant);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('base-1');
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

    it('returns null when variant has no baseline', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue({
        baseline: null,
      });

      const result = await repository.findBaselineByVariant('test-1', variant);

      expect(result).toBeNull();
    });

    it('returns null when variant does not exist', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue(null);

      const result = await repository.findBaselineByVariant('test-1', variant);

      expect(result).toBeNull();
    });

    it('maps a pdf baseline into an entity', async () => {
      const v = {
        baseline: {
          id: 'base-1',
          testId: 'test-1',
          type: 'BASELINE',
          imageHash: 'pdfhash',
          imageUrl: 'http://example.com/doc.pdf',
          pageCount: null,
          pixelDiffThreshold: 0,
          createdAt: now,
        },
      };
      mockClient.unifiedVariant.findUnique.mockResolvedValue(v);

      const result = await repository.findBaselineByVariant('test-1', variant);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('base-1');
      expect(result!.imageUrl).toBe('http://example.com/doc.pdf');
      expect(result!.imageHash).toBe('pdfhash');
    });
  });

  describe('findBaselineIdsByFilters', () => {
    it('returns the baseline of the single resolved variant for a partial filter', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue({
        id: 'variant-1',
      });
      mockClient.unifiedVariant.findMany.mockResolvedValue([
        { baselineId: 'base-1' },
      ]);

      const result = await repository.findBaselineIdsByFilters('test-1', {
        viewport: '1280x720',
      });

      expect(result).toEqual(['base-1']);
      expect(mockClient.unifiedVariant.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['variant-1'] } },
        select: { baselineId: true },
      });
    });

    it('returns every baseline id when no filters are given', async () => {
      mockClient.unifiedVariant.findMany.mockResolvedValue([
        { baselineId: 'base-1' },
        { baselineId: 'base-2' },
      ]);

      const result = await repository.findBaselineIdsByFilters('test-1');

      expect(result).toEqual(['base-1', 'base-2']);
    });
  });

  describe('findScreenshotsForVariant', () => {
    it('returns all screenshots for the test when no variant filters provided', async () => {
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([
        { id: 'ss-1' },
        { id: 'ss-2' },
      ]);

      const result = await repository.findScreenshotsForVariant('test-1');

      expect(result).toEqual([{ id: 'ss-1' }, { id: 'ss-2' }]);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenCalledWith({
        where: { testId: 'test-1' },
        select: { id: true },
      });
    });

    it('returns the screenshots of the resolved variant (full or partial filter)', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue({
        id: 'variant-1',
      });
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([
        { id: 'base-1' },
        { id: 'cand-1' },
      ]);

      const result = await repository.findScreenshotsForVariant('test-1', {
        viewport: '1280x720',
        browser: 'chrome',
        environment: 'production',
      });

      expect(result).toEqual([{ id: 'base-1' }, { id: 'cand-1' }]);
      expect(mockClient.unifiedVariant.findFirst).toHaveBeenCalledWith({
        where: {
          testId: 'test-1',
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
        },
        orderBy: [{ viewport: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenCalledWith({
        where: {
          testId: 'test-1',
          variantId: { in: ['variant-1'] },
        },
        select: { id: true },
      });
      expect(mockClient.unifiedComparison.findMany).not.toHaveBeenCalled();
    });

    it('includes a current row that has no comparison yet (upload in flight)', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue({
        id: 'variant-1',
      });
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([
        { id: 'base-1' },
        { id: 'cand-inflight' },
      ]);

      const result = await repository.findScreenshotsForVariant('test-1', {
        viewport: '1280x720',
      });

      expect(result).toEqual([{ id: 'base-1' }, { id: 'cand-inflight' }]);
    });

    it('returns empty when no variant matches the filters', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue(null);

      const result = await repository.findScreenshotsForVariant('test-1', {
        viewport: 'nonexistent',
      });

      expect(result).toEqual([]);
      expect(mockClient.unifiedScreenshot.findMany).not.toHaveBeenCalled();
    });
  });

  describe('upsertCandidateForVariant', () => {
    it('ensures variant and upserts variant-scoped candidate screenshot', async () => {
      mockClient.unifiedVariant.upsert.mockResolvedValue({ id: 'variant-1' });
      const screenshot = prismaScreenshot({ type: 'CURRENT', id: 'cand-1' });
      mockClient.unifiedScreenshot.upsert.mockResolvedValue(screenshot);

      const result = await repository.upsertCandidateForVariant({
        testId: 'test-1',
        contentHash: 'hash456',
        contentUrl: 'http://example.com/candidate.png',
        variant,
      });

      expect(result).toEqual({ id: 'cand-1', replacedUrl: null });
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
      expect(mockClient.unifiedScreenshot.upsert).toHaveBeenCalledWith({
        where: {
          testId_variantId_type: {
            testId: 'test-1',
            variantId: 'variant-1',
            type: 'CURRENT',
          },
        },
        update: {
          imageHash: 'hash456',
          imageUrl: 'http://example.com/candidate.png',
        },
        create: {
          testId: 'test-1',
          variantId: 'variant-1',
          type: 'CURRENT',
          imageHash: 'hash456',
          imageUrl: 'http://example.com/candidate.png',
        },
      });
    });

    it('persists the page count for PDF candidates', async () => {
      mockClient.unifiedVariant.upsert.mockResolvedValue({ id: 'variant-1' });
      mockClient.unifiedScreenshot.upsert.mockResolvedValue({ id: 'cand-1' });

      const result = await repository.upsertCandidateForVariant({
        testId: 'test-1',
        contentHash: 'candhash',
        contentUrl: 'http://example.com/candidate.pdf',
        variant,
        pageCount: 5,
      });

      expect(result).toEqual({ id: 'cand-1', replacedUrl: null });
      expect(mockClient.unifiedScreenshot.upsert).toHaveBeenCalledWith({
        where: {
          testId_variantId_type: {
            testId: 'test-1',
            variantId: 'variant-1',
            type: 'CURRENT',
          },
        },
        create: {
          testId: 'test-1',
          variantId: 'variant-1',
          type: 'CURRENT',
          imageHash: 'candhash',
          imageUrl: 'http://example.com/candidate.pdf',
          pageCount: 5,
        },
        update: {
          imageHash: 'candhash',
          imageUrl: 'http://example.com/candidate.pdf',
          pageCount: 5,
        },
      });
    });

    it('returns the previously stored candidate URL so the caller can clean it up', async () => {
      mockClient.unifiedVariant.upsert.mockResolvedValue({ id: 'variant-1' });
      mockClient.unifiedScreenshot.upsert.mockResolvedValue(
        prismaScreenshot({
          type: 'CURRENT',
          id: 'cand-1',
          imageUrl: 'http://example.com/candidate.png',
        }),
      );
      mockClient.unifiedScreenshot.findUnique.mockResolvedValue({
        imageUrl: 'http://example.com/old-candidate.png',
      });

      const result = await repository.upsertCandidateForVariant({
        testId: 'test-1',
        contentHash: 'hash456',
        contentUrl: 'http://example.com/candidate.png',
        variant,
      });

      expect(result.replacedUrl).toBe('http://example.com/old-candidate.png');
    });

    it('returns null replacedUrl when no previous candidate existed', async () => {
      mockClient.unifiedVariant.upsert.mockResolvedValue({ id: 'variant-1' });
      mockClient.unifiedScreenshot.upsert.mockResolvedValue(
        prismaScreenshot({
          type: 'CURRENT',
          id: 'cand-1',
          imageUrl: 'http://example.com/candidate.png',
        }),
      );
      mockClient.unifiedScreenshot.findUnique.mockResolvedValue(null);

      const result = await repository.upsertCandidateForVariant({
        testId: 'test-1',
        contentHash: 'hash456',
        contentUrl: 'http://example.com/candidate.png',
        variant,
      });

      expect(result.replacedUrl).toBeNull();
    });
  });

  describe('upsertBaselineForVariant', () => {
    it('upserts variant-scoped baseline screenshot and links via variant', async () => {
      const screenshot = prismaScreenshot({ id: 'base-1' });
      mockClient.unifiedScreenshot.upsert.mockResolvedValue(screenshot);
      mockClient.unifiedVariant.upsert.mockResolvedValue({ id: 'variant-1' });

      await repository.upsertBaselineForVariant({
        testId: 'test-1',
        contentHash: 'hash999',
        contentUrl: 'http://example.com/upserted.png',
        variant,
      });

      expect(mockClient.unifiedScreenshot.upsert).toHaveBeenCalledWith({
        where: {
          testId_variantId_type: {
            testId: 'test-1',
            variantId: 'variant-1',
            type: 'BASELINE',
          },
        },
        update: {
          imageHash: 'hash999',
          imageUrl: 'http://example.com/upserted.png',
        },
        create: {
          testId: 'test-1',
          variantId: 'variant-1',
          type: 'BASELINE',
          imageHash: 'hash999',
          imageUrl: 'http://example.com/upserted.png',
        },
      });
      expect(mockClient.unifiedVariant.upsert).toHaveBeenCalledTimes(1);
      expect(mockClient.unifiedVariant.update).toHaveBeenCalledWith({
        where: { id: 'variant-1' },
        data: { baselineId: 'base-1' },
      });
      // A freshly written baseline is branch-owned; a variant that was an
      // inherited clone must not keep claiming it follows the target.
      expect(mockClient.unifiedVariant.update).toHaveBeenCalledWith({
        where: { id: 'variant-1' },
        data: { isInherited: false },
      });
    });

    it('persists the page count for PDF baselines', async () => {
      mockClient.unifiedVariant.upsert.mockResolvedValue({ id: 'variant-1' });
      mockClient.unifiedScreenshot.upsert.mockResolvedValue({ id: 'base-1' });

      await repository.upsertBaselineForVariant({
        testId: 'test-1',
        contentHash: 'pdfhash',
        contentUrl: 'http://example.com/doc.pdf',
        variant,
        pageCount: 3,
      });

      expect(mockClient.unifiedScreenshot.upsert).toHaveBeenCalledWith({
        where: {
          testId_variantId_type: {
            testId: 'test-1',
            variantId: 'variant-1',
            type: 'BASELINE',
          },
        },
        create: {
          testId: 'test-1',
          variantId: 'variant-1',
          type: 'BASELINE',
          imageHash: 'pdfhash',
          imageUrl: 'http://example.com/doc.pdf',
          pageCount: 3,
        },
        update: {
          imageHash: 'pdfhash',
          imageUrl: 'http://example.com/doc.pdf',
          pageCount: 3,
        },
      });
      expect(mockClient.unifiedVariant.update).toHaveBeenCalledWith({
        where: { id: 'variant-1' },
        data: { baselineId: 'base-1' },
      });
    });
  });

  describe('tightenBaselineThreshold', () => {
    it('lowers a baseline threshold and reports the previous value', async () => {
      mockClient.unifiedScreenshot.findFirst.mockResolvedValue({
        id: 'base-1',
        pixelDiffThreshold: 40,
      });
      mockClient.unifiedScreenshot.updateMany.mockResolvedValue({ count: 1 });

      const previous = await repository.tightenBaselineThreshold(
        'test-1',
        variant,
        10,
      );

      expect(previous).toBe(40);
      expect(mockClient.unifiedScreenshot.updateMany).toHaveBeenCalledWith({
        where: { id: 'base-1', pixelDiffThreshold: 40 },
        data: { pixelDiffThreshold: 10 },
      });
    });

    it('does nothing when the baseline is already at or below the value', async () => {
      mockClient.unifiedScreenshot.findFirst.mockResolvedValue({
        id: 'base-1',
        pixelDiffThreshold: 5,
      });

      const previous = await repository.tightenBaselineThreshold(
        'test-1',
        variant,
        10,
      );

      expect(previous).toBeNull();
      expect(mockClient.unifiedScreenshot.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing when the variant has no baseline', async () => {
      mockClient.unifiedScreenshot.findFirst.mockResolvedValue(null);

      const previous = await repository.tightenBaselineThreshold(
        'test-1',
        variant,
        10,
      );

      expect(previous).toBeNull();
      expect(mockClient.unifiedScreenshot.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateBaselineScreenshot', () => {
    it('updates the baseline screenshot image hash and url without pageCount', async () => {
      mockClient.unifiedScreenshot.update.mockResolvedValue(undefined);

      await repository.updateBaselineScreenshot('base-1', {
        imageHash: 'newhash',
        imageUrl: 'http://example.com/new.png',
      });

      expect(mockClient.unifiedScreenshot.update).toHaveBeenCalledWith({
        where: { id: 'base-1' },
        data: { imageHash: 'newhash', imageUrl: 'http://example.com/new.png' },
      });
    });

    it('updates baseline screenshot with provided pageCount', async () => {
      mockClient.unifiedScreenshot.update.mockResolvedValue(undefined);

      await repository.updateBaselineScreenshot('base-1', {
        imageHash: 'newhash',
        imageUrl: 'http://example.com/new.pdf',
        pageCount: 4,
      });

      expect(mockClient.unifiedScreenshot.update).toHaveBeenCalledWith({
        where: { id: 'base-1' },
        data: {
          imageHash: 'newhash',
          imageUrl: 'http://example.com/new.pdf',
          pageCount: 4,
        },
      });
    });
  });

  describe('updateThresholdMany', () => {
    it('updates pixelDiffThreshold on multiple screenshots', async () => {
      mockClient.unifiedScreenshot.updateMany.mockResolvedValue(undefined);

      await repository.updateThresholdMany(['ss-1', 'ss-2'], 0.5);

      expect(mockClient.unifiedScreenshot.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ss-1', 'ss-2'] } },
        data: { pixelDiffThreshold: 0.5 },
      });
    });

    it('does not query when no screenshot ids are given', async () => {
      await repository.updateThresholdMany([], 0.5);

      expect(mockClient.unifiedScreenshot.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('findCurrentByVariant', () => {
    it('returns the current screenshot id and hash for a variant', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue({
        id: 'variant-1',
      });
      mockClient.unifiedScreenshot.findUnique.mockResolvedValue({
        id: 'current-1',
        imageHash: 'current-hash',
      });

      const result = await repository.findCurrentByVariant('test-1', variant);

      expect(result).toEqual({ id: 'current-1', imageHash: 'current-hash' });
      expect(mockClient.unifiedScreenshot.findUnique).toHaveBeenCalledWith({
        where: {
          testId_variantId_type: {
            testId: 'test-1',
            variantId: 'variant-1',
            type: 'CURRENT',
          },
        },
        select: { id: true, imageHash: true },
      });
      expect(mockClient.unifiedVariant.upsert).not.toHaveBeenCalled();
    });

    it('returns null when no current screenshot exists for the variant', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue({
        id: 'variant-1',
      });
      mockClient.unifiedScreenshot.findUnique.mockResolvedValue(null);

      const result = await repository.findCurrentByVariant('test-1', variant);

      expect(result).toBeNull();
    });
  });

  describe('PdfBaselineByVariant', () => {
    it('returns pdf baseline entity when variant has baseline', async () => {
      const v = {
        baseline: {
          id: 'base-1',
          testId: 'test-1',
          type: 'BASELINE',
          imageUrl: 'http://example.com/doc.pdf',
          imageHash: 'pdfhash',
          pageCount: 3,
          pixelDiffThreshold: 0,
          createdAt: now,
        },
      };
      mockClient.unifiedVariant.findUnique.mockResolvedValue(v);

      const result = await repository.findBaselineByVariant('test-1', variant);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('base-1');
      expect(result!.imageUrl).toBe('http://example.com/doc.pdf');
      expect(result!.imageHash).toBe('pdfhash');
    });

    it('returns null when variant does not exist', async () => {
      mockClient.unifiedVariant.findUnique.mockResolvedValue(null);

      const result = await repository.findBaselineByVariant('test-1', variant);

      expect(result).toBeNull();
    });
  });

  describe('findImageUrlsByIds', () => {
    it('returns image urls for given screenshot ids', async () => {
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([
        { imageUrl: 'http://example.com/1.png' },
        { imageUrl: 'http://example.com/2.png' },
      ]);

      const result = await repository.findImageUrlsByIds(['ss-1', 'ss-2']);

      expect(result).toEqual([
        'http://example.com/1.png',
        'http://example.com/2.png',
      ]);
    });

    it('returns empty array when no ids given', async () => {
      const result = await repository.findImageUrlsByIds([]);

      expect(result).toEqual([]);
      expect(mockClient.unifiedScreenshot.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findAllImageUrlsForTests', () => {
    it('returns every image url for the given test ids', async () => {
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([
        { imageUrl: 'http://example.com/1.png' },
        { imageUrl: 'http://example.com/2.png' },
      ]);

      const result = await repository.findAllImageUrlsForTests([
        'test-1',
        'test-2',
      ]);

      expect(result).toEqual([
        'http://example.com/1.png',
        'http://example.com/2.png',
      ]);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenCalledWith({
        where: { testId: { in: ['test-1', 'test-2'] } },
        select: { imageUrl: true },
      });
    });

    it('returns empty array when no test ids given', async () => {
      const result = await repository.findAllImageUrlsForTests([]);

      expect(result).toEqual([]);
      expect(mockClient.unifiedScreenshot.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findReferencedImageUrls', () => {
    it('returns the urls any screenshot row currently holds', async () => {
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([
        { imageUrl: 'http://example.com/referenced.png' },
      ]);

      const result = await repository.findReferencedImageUrls([
        'http://example.com/referenced.png',
        'http://example.com/free.png',
      ]);

      expect(result).toEqual(['http://example.com/referenced.png']);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenCalledWith({
        where: {
          imageUrl: {
            in: [
              'http://example.com/referenced.png',
              'http://example.com/free.png',
            ],
          },
        },
        select: { imageUrl: true },
      });
    });

    it('returns empty array when no urls given', async () => {
      const result = await repository.findReferencedImageUrls([]);

      expect(result).toEqual([]);
      expect(mockClient.unifiedScreenshot.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteMany', () => {
    it('deletes multiple screenshots by ids', async () => {
      mockClient.unifiedScreenshot.deleteMany.mockResolvedValue({ count: 2 });

      await repository.deleteMany(['ss-1', 'ss-2']);

      expect(mockClient.unifiedScreenshot.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['ss-1', 'ss-2'] } },
      });
    });

    it('does nothing when empty ids array', async () => {
      await repository.deleteMany([]);

      expect(mockClient.unifiedScreenshot.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteCandidatesAndCollectUrls', () => {
    it('deletes current screenshots and returns urls not shared with baselines', async () => {
      mockClient.unifiedScreenshot.findMany
        .mockResolvedValueOnce([
          { id: 'cand-1', imageUrl: 'http://example.com/cand.png' },
          { id: 'cand-2', imageUrl: 'http://example.com/shared.png' },
        ])
        .mockResolvedValueOnce([{ imageUrl: 'http://example.com/shared.png' }])
        .mockResolvedValueOnce([]);
      mockClient.unifiedScreenshot.deleteMany.mockResolvedValue({ count: 2 });

      const result = await repository.deleteCandidatesAndCollectUrls([
        'cand-1',
        'cand-2',
      ]);

      expect(result).toEqual(['http://example.com/cand.png']);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['cand-1', 'cand-2'] },
          type: 'CURRENT',
          asCandidateComp: { none: {} },
        },
        select: { id: true, imageUrl: true },
      });
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          type: 'BASELINE',
          imageUrl: {
            in: [
              'http://example.com/cand.png',
              'http://example.com/shared.png',
            ],
          },
        },
        select: { imageUrl: true },
      });
      expect(mockClient.unifiedScreenshot.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['cand-1', 'cand-2'] } },
      });
    });

    it('keeps candidate rows still referenced by a surviving comparison', async () => {
      mockClient.unifiedScreenshot.findMany
        .mockResolvedValueOnce([
          { id: 'cand-2', imageUrl: 'http://example.com/cand-2.png' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockClient.unifiedScreenshot.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repository.deleteCandidatesAndCollectUrls([
        'cand-1',
        'cand-2',
      ]);

      expect(result).toEqual(['http://example.com/cand-2.png']);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['cand-1', 'cand-2'] },
          type: 'CURRENT',
          asCandidateComp: { none: {} },
        },
        select: { id: true, imageUrl: true },
      });
      expect(mockClient.unifiedScreenshot.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['cand-2'] } },
      });
    });

    it('returns empty when no ids given', async () => {
      const result = await repository.deleteCandidatesAndCollectUrls([]);

      expect(result).toEqual([]);
      expect(mockClient.unifiedScreenshot.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteCandidateIfCurrent', () => {
    it('deletes the candidate only when its row still holds the expected url', async () => {
      mockClient.unifiedScreenshot.findUnique.mockResolvedValue({
        imageUrl: 'http://storage/candidate.png',
      });
      mockClient.unifiedScreenshot.findMany
        .mockResolvedValueOnce([
          { id: 'cand-1', imageUrl: 'http://storage/candidate.png' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockClient.unifiedScreenshot.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repository.deleteCandidateIfCurrent(
        'cand-1',
        'http://storage/candidate.png',
      );

      expect(result).toEqual(['http://storage/candidate.png']);
      expect(mockClient.unifiedScreenshot.findUnique).toHaveBeenCalledWith({
        where: { id: 'cand-1' },
        select: { imageUrl: true },
      });
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['cand-1'] },
          type: 'CURRENT',
          asCandidateComp: { none: {} },
        },
        select: { id: true, imageUrl: true },
      });
      expect(mockClient.unifiedScreenshot.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['cand-1'] } },
      });
    });

    it('returns empty when the row is gone', async () => {
      mockClient.unifiedScreenshot.findUnique.mockResolvedValue(null);

      const result = await repository.deleteCandidateIfCurrent(
        'cand-1',
        'http://storage/candidate.png',
      );

      expect(result).toEqual([]);
      expect(mockClient.unifiedScreenshot.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('filterReclaimableUrls', () => {
    it('keeps only urls not referenced by any baseline', async () => {
      mockClient.unifiedScreenshot.findMany
        .mockResolvedValueOnce([{ imageUrl: 'http://example.com/shared.png' }])
        .mockResolvedValueOnce([]);

      const result = await repository.filterReclaimableUrls([
        'http://example.com/shared.png',
        'http://example.com/free.png',
      ]);

      expect(result).toEqual(['http://example.com/free.png']);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          type: 'BASELINE',
          imageUrl: {
            in: [
              'http://example.com/shared.png',
              'http://example.com/free.png',
            ],
          },
        },
        select: { imageUrl: true },
      });
    });

    it('keeps only urls whose current row is not referenced by a comparison', async () => {
      mockClient.unifiedScreenshot.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { imageUrl: 'http://example.com/referenced.png' },
        ]);

      const result = await repository.filterReclaimableUrls([
        'http://example.com/referenced.png',
        'http://example.com/free.png',
      ]);

      expect(result).toEqual(['http://example.com/free.png']);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          type: 'CURRENT',
          imageUrl: {
            in: [
              'http://example.com/referenced.png',
              'http://example.com/free.png',
            ],
          },
          asCandidateComp: { some: {} },
        },
        select: { imageUrl: true },
      });
    });

    it('applies the baseline filter before the comparison-referenced filter', async () => {
      mockClient.unifiedScreenshot.findMany
        .mockResolvedValueOnce([
          { imageUrl: 'http://example.com/baseline.png' },
        ])
        .mockResolvedValueOnce([
          { imageUrl: 'http://example.com/comparison.png' },
        ]);

      const result = await repository.filterReclaimableUrls([
        'http://example.com/baseline.png',
        'http://example.com/comparison.png',
        'http://example.com/free.png',
      ]);

      expect(result).toEqual(['http://example.com/free.png']);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          type: 'BASELINE',
          imageUrl: {
            in: [
              'http://example.com/baseline.png',
              'http://example.com/comparison.png',
              'http://example.com/free.png',
            ],
          },
        },
        select: { imageUrl: true },
      });
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          type: 'CURRENT',
          imageUrl: {
            in: [
              'http://example.com/comparison.png',
              'http://example.com/free.png',
            ],
          },
          asCandidateComp: { some: {} },
        },
        select: { imageUrl: true },
      });
    });

    it('keeps only urls not referenced by a baseline revision', async () => {
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([]);
      mockClient.baselineRevision.findMany.mockResolvedValueOnce([
        { imageUrl: 'http://example.com/history.png' },
      ]);

      const result = await repository.filterReclaimableUrls([
        'http://example.com/history.png',
        'http://example.com/free.png',
      ]);

      expect(result).toEqual(['http://example.com/free.png']);
      expect(mockClient.baselineRevision.findMany).toHaveBeenCalledWith({
        where: {
          imageUrl: {
            in: [
              'http://example.com/history.png',
              'http://example.com/free.png',
            ],
          },
        },
        select: { imageUrl: true },
      });
    });

    it('returns empty array when input is empty', async () => {
      const result = await repository.filterReclaimableUrls([]);

      expect(result).toEqual([]);
      expect(mockClient.unifiedScreenshot.findMany).not.toHaveBeenCalled();
      expect(mockClient.baselineRevision.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findBaselineForBranch', () => {
    const variant = Variant.fromStrings('1920x1080', 'chromium', 'staging');

    it('resolves the ancestor baseline of the test with the same name', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue({
        baseline: {
          id: 'base-1',
          testId: 'main-test-1',
          imageHash: 'hash',
          imageUrl: 'http://storage/baseline.pdf',
          pageCount: 2,
          pixelDiffThreshold: 3,
        },
      });

      const result = await repository.findBaselineForBranch(
        'br-main',
        'pdf-report',
        variant,
      );

      expect(result).toEqual({
        testId: 'main-test-1',
        imageHash: 'hash',
        imageUrl: 'http://storage/baseline.pdf',
        pageCount: 2,
        pixelDiffThreshold: 3,
      });
      expect(mockClient.unifiedVariant.findFirst).toHaveBeenCalledWith({
        where: {
          test: { branchId: 'br-main', name: 'pdf-report' },
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
          isInherited: false,
          baselineId: { not: null },
        },
        include: { baseline: true },
      });
    });

    it('returns null when the ancestor has no baseline for that variant', async () => {
      mockClient.unifiedVariant.findFirst.mockResolvedValue(null);

      await expect(
        repository.findBaselineForBranch('br-main', 'login', variant),
      ).resolves.toBeNull();
    });
  });
});
