import {
  decideThresholdAction,
  effectivePixelThreshold,
  isThresholdExceeded,
  isWithinThreshold,
} from '@public/visualTest/core/domain/policies/threshold-policy';

describe('ThresholdPolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('decideThresholdAction', () => {
    it('deletes a comparison within the new threshold', () => {
      expect(decideThresholdAction({ mismatchPixelCount: 40 }, 50)).toBe(
        'DELETE',
      );
    });

    it('keeps a comparison above the new threshold', () => {
      expect(decideThresholdAction({ mismatchPixelCount: 60 }, 50)).toBe(
        'KEEP',
      );
    });
  });

  describe('isThresholdExceeded', () => {
    it('is true when mismatch exceeds the baseline threshold', () => {
      expect(isThresholdExceeded(51, 50)).toBe(true);
    });

    it('is false when mismatch is at or below the threshold', () => {
      expect(isThresholdExceeded(50, 50)).toBe(false);
    });

    it('treats a missing baseline threshold as 0', () => {
      expect(isThresholdExceeded(40, undefined)).toBe(true);
      expect(isThresholdExceeded(0, undefined)).toBe(false);
    });
  });

  describe('isWithinThreshold', () => {
    it('tolerates an image mismatch at the threshold', () => {
      expect(isWithinThreshold('image', 50, 50)).toBe(true);
    });

    it('rejects an image mismatch above the threshold', () => {
      expect(isWithinThreshold('image', 51, 50)).toBe(false);
    });

    it('tolerates nothing when the threshold is missing or null', () => {
      expect(isWithinThreshold('image', 1, undefined)).toBe(false);
      expect(isWithinThreshold('image', 1, null)).toBe(false);
    });

    it('never tolerates a PDF comparison', () => {
      expect(isWithinThreshold('pdf', 0, 500)).toBe(false);
    });

    it('inherits the project default only when the variant threshold is unset', () => {
      expect(effectivePixelThreshold(0, 50)).toBe(50);
      expect(effectivePixelThreshold(null, 50)).toBe(50);
      expect(effectivePixelThreshold(undefined, 50)).toBe(50);
      expect(effectivePixelThreshold(20, 50)).toBe(20);
      expect(effectivePixelThreshold(0, null)).toBe(0);
      expect(isWithinThreshold('image', 15, 0, 50)).toBe(true);
      expect(isWithinThreshold('image', 25, 20, 50)).toBe(false);
    });

    it('agrees with decideThresholdAction on the boundary', () => {
      for (const mismatch of [49, 50, 51]) {
        expect(
          decideThresholdAction({ mismatchPixelCount: mismatch }, 50) ===
            'DELETE',
        ).toBe(isWithinThreshold('image', mismatch, 50));
      }
    });
  });
});
