import type { TestKind } from '@common/domain/test-kind';

export interface ThresholdComparison {
  mismatchPixelCount: number;
}

export type ThresholdAction = 'DELETE' | 'KEEP';

// The boundary, defined once: a mismatch exceeds the threshold when it is
// strictly above it, and a missing threshold is read as 0 (the schema default),
// so it tolerates nothing. Every reader derives from this — the comparison
// entity's
// `thresholdExceeded` read flag, the auto-accept decision, and the worker's
// "within tolerance" branch — so the boundary cannot drift between the update
// path and the worker.
export function isThresholdExceeded(
  mismatchPixelCount: number,
  baselineThreshold?: number,
): boolean {
  // A missing threshold is 0, i.e. "no tolerance": any mismatch exceeds it.
  // (Returning false here used to tolerate every change on a legacy row, the
  // opposite of what this policy and the schema default document.)
  return mismatchPixelCount > (baselineThreshold ?? 0);
}

// Threshold is an image-only concept, so a PDF comparison is never tolerated no
// matter what its row carries. `threshold` is the baseline's raw value, which
// may be missing on a legacy row or a partial double — the same 0 default the
// schema uses.
export function isWithinThreshold(
  kind: TestKind,
  mismatchPixelCount: number,
  threshold?: number | null,
): boolean {
  if (kind !== 'image') return false;
  return !isThresholdExceeded(mismatchPixelCount, threshold ?? 0);
}

// CONTEXT.md: when a user raises the threshold, existing PENDING_APPROVAL
// comparisons whose mismatch is at or below the new value are deleted
// (auto-accepted). The rule is post-comparison only, and it is only ever called
// on rows the caller has already narrowed to PENDING_APPROVAL
// (findPendingForBaselines filters at the query level) — the status predicate
// lives in that query, not here. The update path is image-only (a PDF threshold
// update is rejected upstream), so it asks the image question; the boundary it
// shares with the worker is `isWithinThreshold`.
export function decideThresholdAction(
  comparison: ThresholdComparison,
  newThreshold: number,
): ThresholdAction {
  return isWithinThreshold('image', comparison.mismatchPixelCount, newThreshold)
    ? 'DELETE'
    : 'KEEP';
}
