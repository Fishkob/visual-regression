import {
  ComparisonRow,
  toComparisonEntityWithRelations,
} from '@public/visualTest/core/infrastructure/mappers/comparison.mapper';

const baseRow = {
  id: 'comp-1',
  testId: 'test-1',
  mismatchPixelCount: 10,
  diffImageUrl: 'http://storage/diff.png',
  diffPdfUrl: null,
  changedRegions: null,
  status: 'PENDING_APPROVAL',
  baselineId: 'baseline-1',
  candidateId: 'candidate-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('comparison.mapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('toComparisonEntityWithRelations', () => {
    const relatedRow: ComparisonRow = {
      ...baseRow,
      pageCount: 8,
      mismatchPageCount: 2,
      baseline: {
        id: 'baseline-1',
        testId: 'test-1',
        type: 'BASELINE',
        imageHash: 'hash',
        imageUrl: 'http://storage/baseline.png',
        pageCount: 8,
        pixelDiffThreshold: 0,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        variantId: null,
        asBaseline: {
          id: 'variant-1',
          testId: 'test-1',
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
          baselineId: 'baseline-1',
        },
      },
      candidate: {
        id: 'candidate-1',
        testId: 'test-1',
        type: 'CURRENT',
        imageHash: 'hash2',
        imageUrl: 'http://storage/candidate.png',
        pageCount: 8,
        pixelDiffThreshold: 0,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        variantId: null,
      },
    } as unknown as ComparisonRow;

    it('maps pageCount from the document pageCount column independently of mismatch count', () => {
      const entity = toComparisonEntityWithRelations(relatedRow);

      expect(entity.pageCount).toBe(8);
      expect(entity.mismatchPageCount).toBe(2);
    });

    it('maps stored changed regions onto the entity', () => {
      const row = {
        ...relatedRow,
        changedRegions: [
          { x: 10, y: 20, width: 30, height: 40, pixelCount: 500 },
        ],
      } as unknown as ComparisonRow;

      const entity = toComparisonEntityWithRelations(row);

      expect(entity.changedRegions).toEqual([
        { x: 10, y: 20, width: 30, height: 40, pixelCount: 500 },
      ]);
    });

    it('drops malformed changed regions instead of failing the read', () => {
      const row = {
        ...relatedRow,
        changedRegions: [
          { x: 1, y: 2, width: 3, height: 4, pixelCount: 5 },
          { x: 'nope', y: 2, width: 3, height: 4, pixelCount: 5 },
          null,
        ],
      } as unknown as ComparisonRow;

      const entity = toComparisonEntityWithRelations(row);

      expect(entity.changedRegions).toEqual([
        { x: 1, y: 2, width: 3, height: 4, pixelCount: 5 },
      ]);
    });

    it('maps an absent region list to undefined', () => {
      const entity = toComparisonEntityWithRelations(
        relatedRow as ComparisonRow,
      );

      expect(entity.changedRegions).toBeUndefined();
    });

    it('maps a null candidateId to an undefined candidate reference', () => {
      const approvedRow = {
        ...baseRow,
        candidateId: null,
        status: 'APPROVED',
        baseline: relatedRow.baseline,
        candidate: null,
      } as unknown as ComparisonRow;

      const entity = toComparisonEntityWithRelations(approvedRow);

      expect(entity.candidateId).toBeUndefined();
      expect(entity.candidate).toBeUndefined();
    });
  });
});
