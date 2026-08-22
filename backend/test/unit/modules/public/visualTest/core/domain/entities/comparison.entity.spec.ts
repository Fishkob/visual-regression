import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { DomainError } from '@common/domain/domain-error';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonStatus,
  ScreenshotType,
} from '@public/visualTest/core/domain/types/visual-test.types';

describe('ComparisonEntity', () => {
  const validParams = {
    id: 'cmp-1',
    visualTestId: 'vt-1',
    mismatchPixelCount: 42,
    diffImageUrl: 'http://storage/diff.png',
    status: ComparisonStatus.PENDING_APPROVAL,
    baselineId: 'b-1',
    candidateId: 'c-1',
    createdAt: new Date('2024-01-01'),
  };

  describe('constructor', () => {
    it('creates entity with valid params', () => {
      const entity = new ComparisonEntity(validParams);

      expect(entity.id).toBe('cmp-1');
      expect(entity.visualTestId).toBe('vt-1');
      expect(entity.mismatchPixelCount).toBe(42);
      expect(entity.diffImageUrl).toBe('http://storage/diff.png');
      expect(entity.status).toBe(ComparisonStatus.PENDING_APPROVAL);
      expect(entity.baselineId).toBe('b-1');
      expect(entity.candidateId).toBe('c-1');
    });

    it('throws when id is empty', () => {
      expect(() => new ComparisonEntity({ ...validParams, id: '' })).toThrow(
        DomainError,
      );
    });

    it('throws when id is whitespace', () => {
      expect(() => new ComparisonEntity({ ...validParams, id: '  ' })).toThrow(
        DomainError,
      );
    });

    it('throws when visualTestId is empty', () => {
      expect(
        () => new ComparisonEntity({ ...validParams, visualTestId: '' }),
      ).toThrow(DomainError);
    });

    it('throws when mismatchPixelCount is negative', () => {
      expect(
        () => new ComparisonEntity({ ...validParams, mismatchPixelCount: -1 }),
      ).toThrow(DomainError);
    });

    it('throws when baselineId is empty', () => {
      expect(
        () => new ComparisonEntity({ ...validParams, baselineId: '' }),
      ).toThrow(DomainError);
    });

    it('allows a comparison without a candidateId (approved history row)', () => {
      expect(
        () => new ComparisonEntity({ ...validParams, candidateId: undefined }),
      ).not.toThrow();
    });
  });

  describe('thresholdExceeded', () => {
    const baseline = new ScreenshotEntity({
      id: 'b-1',
      visualTestId: 'vt-1',
      type: ScreenshotType.BASELINE,
      imageHash: 'hash',
      imageUrl: 'http://storage/baseline.png',
      variant: Variant.fromStrings('1280x800', 'chromium', 'prod'),
      createdAt: new Date('2024-01-01'),
      pixelDiffThreshold: 10,
    });

    it('returns true when mismatch exceeds baseline threshold', () => {
      const entity = new ComparisonEntity({
        ...validParams,
        mismatchPixelCount: 15,
        baseline,
      });
      expect(entity.thresholdExceeded).toBe(true);
    });

    it('returns false when mismatch is within threshold', () => {
      const entity = new ComparisonEntity({
        ...validParams,
        mismatchPixelCount: 5,
        baseline,
      });
      expect(entity.thresholdExceeded).toBe(false);
    });

    it('returns false when there is no baseline', () => {
      const entity = new ComparisonEntity(validParams);
      expect(entity.thresholdExceeded).toBe(false);
    });
  });

  describe('approve', () => {
    const baseline = new ScreenshotEntity({
      id: 'b-1',
      visualTestId: 'vt-1',
      type: ScreenshotType.BASELINE,
      imageHash: 'hash',
      imageUrl: 'http://storage/baseline.png',
      variant: Variant.fromStrings('1280x800', 'chromium', 'prod'),
      createdAt: new Date('2024-01-01'),
      pixelDiffThreshold: 0,
    });

    const candidate = new ScreenshotEntity({
      id: 'c-1',
      visualTestId: 'vt-1',
      type: ScreenshotType.CURRENT,
      imageHash: 'candidate-hash',
      imageUrl: 'http://storage/candidate.png',
      variant: Variant.fromStrings('1280x800', 'chromium', 'prod'),
      createdAt: new Date('2024-01-02'),
      pixelDiffThreshold: 0,
    });

    it('carries the diff pdf url onto the approval decision', () => {
      const entity = new ComparisonEntity({
        ...validParams,
        diffPdfUrl: 'http://storage/diff.pdf',
      });

      const decision = entity.approve(baseline, candidate);

      expect(decision.diffPdfUrl).toBe('http://storage/diff.pdf');
    });

    it('carries an undefined diff pdf url for image comparisons', () => {
      const entity = new ComparisonEntity(validParams);

      const decision = entity.approve(baseline, candidate);

      expect(decision.diffPdfUrl).toBeUndefined();
    });

    it('refuses to approve a comparison that is not pending approval', () => {
      const entity = new ComparisonEntity({
        ...validParams,
        status: ComparisonStatus.APPROVED,
      });

      expect(() => entity.approve(baseline, candidate)).toThrow(DomainError);
    });
  });
});
