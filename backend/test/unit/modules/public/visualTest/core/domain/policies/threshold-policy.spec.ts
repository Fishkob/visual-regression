import {
  decideThresholdAction,
  isThresholdExceeded,
} from '@public/visualTest/core/domain/policies/threshold-policy';

describe('ThresholdPolicy', () => {
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

    it('is false when no baseline threshold is set', () => {
      expect(isThresholdExceeded(40, undefined)).toBe(false);
    });
  });
});
