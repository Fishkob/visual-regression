import { Test, TestingModule } from '@nestjs/testing';
import { StorageObjectReferencednessService } from '@public/visualTest/core/infrastructure/repositories/storage-object-referencedness.service';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { createMock } from '@test/utils/create-mock';

describe('StorageObjectReferencednessService', () => {
  let service: StorageObjectReferencednessService;
  let screenshots: jest.Mocked<UnifiedScreenshotRepository>;
  let comparisons: jest.Mocked<UnifiedComparisonsRepository>;

  beforeEach(async () => {
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.findReferencedImageUrls.mockResolvedValue([]);
    screenshots.filterReclaimableUrls.mockResolvedValue([]);
    comparisons = createMock<UnifiedComparisonsRepository>();
    comparisons.findReferencedDiffUrls.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageObjectReferencednessService,
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: UnifiedComparisonsRepository, useValue: comparisons },
      ],
    }).compile();

    service = module.get(StorageObjectReferencednessService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findReferencedUrls', () => {
    it('unions screenshot content and comparison diff URLs', async () => {
      screenshots.findReferencedImageUrls.mockResolvedValue([
        'http://storage/a.png',
        'http://storage/shared.png',
      ]);
      comparisons.findReferencedDiffUrls.mockResolvedValue([
        'http://storage/diff.png',
        'http://storage/shared.png',
      ]);

      const result = await service.findReferencedUrls([
        'http://storage/a.png',
        'http://storage/diff.png',
        'http://storage/shared.png',
      ]);

      expect(result).toEqual(
        expect.arrayContaining([
          'http://storage/a.png',
          'http://storage/diff.png',
          'http://storage/shared.png',
        ]),
      );
      expect(result).toHaveLength(3);
      expect(screenshots.findReferencedImageUrls).toHaveBeenCalledWith([
        'http://storage/a.png',
        'http://storage/diff.png',
        'http://storage/shared.png',
      ]);
      expect(comparisons.findReferencedDiffUrls).toHaveBeenCalledWith([
        'http://storage/a.png',
        'http://storage/diff.png',
        'http://storage/shared.png',
      ]);
    });

    it('returns empty for an empty input without querying', async () => {
      const result = await service.findReferencedUrls([]);

      expect(result).toEqual([]);
      expect(screenshots.findReferencedImageUrls).not.toHaveBeenCalled();
      expect(comparisons.findReferencedDiffUrls).not.toHaveBeenCalled();
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
  });
});
