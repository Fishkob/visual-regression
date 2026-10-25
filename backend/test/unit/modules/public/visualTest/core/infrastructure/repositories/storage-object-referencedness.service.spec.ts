import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { StorageObjectReferencednessService } from '@public/visualTest/core/infrastructure/repositories/storage-object-referencedness.service';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { BaselineRevisionRepository } from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { createMock } from '@test/utils/create-mock';

describe('StorageObjectReferencednessService', () => {
  let service: StorageObjectReferencednessService;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let revisions: Mocked<BaselineRevisionRepository>;

  beforeEach(async () => {
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.findReferencedImageUrls.mockResolvedValue([]);
    screenshots.filterReclaimableUrls.mockResolvedValue([]);
    comparisons = createMock<UnifiedComparisonsRepository>();
    comparisons.findReferencedDiffUrls.mockResolvedValue([]);
    revisions = createMock<BaselineRevisionRepository>();
    revisions.findReferencedUrls.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageObjectReferencednessService,
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: UnifiedComparisonsRepository, useValue: comparisons },
        { provide: BaselineRevisionRepository, useValue: revisions },
      ],
    }).compile();

    service = module.get(StorageObjectReferencednessService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findReferencedUrls', () => {
    it('unions screenshot content, comparison diff and baseline revision URLs', async () => {
      screenshots.findReferencedImageUrls.mockResolvedValue([
        'http://storage/a.png',
        'http://storage/shared.png',
      ]);
      comparisons.findReferencedDiffUrls.mockResolvedValue([
        'http://storage/diff.png',
        'http://storage/shared.png',
      ]);
      revisions.findReferencedUrls.mockResolvedValue([
        'http://storage/revision.png',
        'http://storage/shared.png',
      ]);

      const result = await service.findReferencedUrls([
        'http://storage/a.png',
        'http://storage/diff.png',
        'http://storage/revision.png',
        'http://storage/shared.png',
      ]);

      expect(result).toEqual(
        expect.arrayContaining([
          'http://storage/a.png',
          'http://storage/diff.png',
          'http://storage/revision.png',
          'http://storage/shared.png',
        ]),
      );
      expect(result).toHaveLength(4);
      expect(screenshots.findReferencedImageUrls).toHaveBeenCalledWith([
        'http://storage/a.png',
        'http://storage/diff.png',
        'http://storage/revision.png',
        'http://storage/shared.png',
      ]);
      expect(comparisons.findReferencedDiffUrls).toHaveBeenCalledWith([
        'http://storage/a.png',
        'http://storage/diff.png',
        'http://storage/revision.png',
        'http://storage/shared.png',
      ]);
      expect(revisions.findReferencedUrls).toHaveBeenCalledWith([
        'http://storage/a.png',
        'http://storage/diff.png',
        'http://storage/revision.png',
        'http://storage/shared.png',
      ]);
    });

    it('returns empty for an empty input without querying', async () => {
      const result = await service.findReferencedUrls([]);

      expect(result).toEqual([]);
      expect(screenshots.findReferencedImageUrls).not.toHaveBeenCalled();
      expect(comparisons.findReferencedDiffUrls).not.toHaveBeenCalled();
      expect(revisions.findReferencedUrls).not.toHaveBeenCalled();
    });

    it('queries each repository in 2_000-URL batches and merges the results uniquely', async () => {
      const urls = makeUrls(5_001);
      screenshots.findReferencedImageUrls.mockImplementation(async (batch) => [
        batch[0],
        'http://storage/shared.png',
      ]);
      comparisons.findReferencedDiffUrls.mockImplementation(async (batch) => [
        batch[batch.length - 1],
        'http://storage/shared.png',
      ]);
      revisions.findReferencedUrls.mockImplementation(async (batch) => [
        batch[0],
      ]);
      const expectedBatches = [
        urls.slice(0, 2_000),
        urls.slice(2_000, 4_000),
        urls.slice(4_000),
      ];

      const result = await service.findReferencedUrls(urls);

      expect(batchedCallSizes(screenshots.findReferencedImageUrls)).toEqual([
        2_000, 2_000, 1_001,
      ]);
      expect(batchedCallSizes(comparisons.findReferencedDiffUrls)).toEqual([
        2_000, 2_000, 1_001,
      ]);
      expect(batchedCallSizes(revisions.findReferencedUrls)).toEqual([
        2_000, 2_000, 1_001,
      ]);
      expect(
        screenshots.findReferencedImageUrls.mock.calls.map(([batch]) => batch),
      ).toEqual(expectedBatches);
      expect(
        comparisons.findReferencedDiffUrls.mock.calls.map(([batch]) => batch),
      ).toEqual(expectedBatches);
      expect(
        revisions.findReferencedUrls.mock.calls.map(([batch]) => batch),
      ).toEqual(expectedBatches);
      expect(result).toHaveLength(7);
      expect(new Set(result).size).toBe(result.length);
    });
  });

  describe('filterReclaimableUrls', () => {
    it('delegates to the screenshot repository reclaim filter', async () => {
      screenshots.filterReclaimableUrls.mockResolvedValue([
        'http://storage/reclaimable.png',
      ]);

      const result = await service.filterReclaimableUrls([
        'http://storage/reclaimable.png',
        'http://storage/protected.png',
      ]);

      expect(result).toEqual(['http://storage/reclaimable.png']);
      expect(screenshots.filterReclaimableUrls).toHaveBeenCalledWith([
        'http://storage/reclaimable.png',
        'http://storage/protected.png',
      ]);
    });

    it('filters in 2_000-URL batches and deduplicates the merged result', async () => {
      const urls = makeUrls(5_001);
      screenshots.filterReclaimableUrls.mockImplementation(async (batch) => [
        batch[0],
        'http://storage/shared.png',
      ]);

      const result = await service.filterReclaimableUrls(urls);

      expect(batchedCallSizes(screenshots.filterReclaimableUrls)).toEqual([
        2_000, 2_000, 1_001,
      ]);
      expect(new Set(result).size).toBe(result.length);
      expect(result).toHaveLength(4);
    });
  });
});

function makeUrls(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `http://storage/${index}.png`,
  );
}

function batchedCallSizes(mock: { mock: { calls: unknown[][] } }): number[] {
  return mock.mock.calls.map(([batch]) => (batch as string[]).length);
}
