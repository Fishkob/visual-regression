export interface ThresholdComparison {
  mismatchPixelCount: number;
}

export type ThresholdAction = 'DELETE' | 'KEEP';

// CONTEXT.md: when a user raises the threshold, existing PENDING_APPROVAL
// comparisons whose mismatch is at or below the new value are deleted
// (auto-accepted). The rule is post-comparison only, and it is only ever called
// on rows the caller has already narrowed to PENDING_APPROVAL
// (findPendingForBaselines filters at the query level) — the status predicate
// lives in that query, not here.
export function decideThresholdAction(
  comparison: ThresholdComparison,
  newThreshold: number,
): ThresholdAction {
  return comparison.mismatchPixelCount <= newThreshold ? 'DELETE' : 'KEEP';
}

// Image rule: a mismatch exceeds the baseline threshold when it is strictly
// above it. With no baseline threshold there is nothing to exceed.
export function isThresholdExceeded(
  mismatchPixelCount: number,
  baselineThreshold?: number,
): boolean {
  return baselineThreshold !== undefined
    ? mismatchPixelCount > baselineThreshold
    : false;
}
