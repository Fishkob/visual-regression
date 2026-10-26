import type {
  RunState,
  RunStatusCounts,
} from '@public/visualTest/core/domain/types/run.types';

// The one owner of "is this run done?". The question was answered twice before
// — by the run gate in RunService and by the anonymous share page — and the two
// disagreed: the share page subtracted the muted comparisons, the gate did not.
// docs/ci-integration.md ("Job states / Run states") is explicit that muted work
// does not hold the run gate, so the subtraction is the rule. It is decided
// here, once. The API keeps reporting both numbers (`pendingComparisons` and
// its `mutedPending` subset) so a consumer can explain the gap instead of
// re-deriving it.
export type RunGateCounts = Pick<
  RunStatusCounts,
  'pendingComparisons' | 'mutedPending' | 'pendingJobs' | 'failedJobs'
>;

// Pending comparisons that actually ask a reviewer for something. A muted test
// is still waiting for review, but its owner deferred it on purpose, so it must
// not hold a pipeline hostage. Clamped at zero because the two counts are read
// by separate queries: an approval landing between them can make the muted
// subset look larger than the whole.
export function reviewablePendingCount(counts: RunGateCounts): number {
  return Math.max(0, counts.pendingComparisons - counts.mutedPending);
}

// "Is this test muted right now?" for readers that already hold the row. The
// SQL twins of this predicate live in reviewable-pending.sql.ts and
// RunRepository.statusCounts; a row-shaped reader uses this one instead of
// re-spelling the comparison.
export function isMutedNow(
  mutedUntil: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return mutedUntil != null && mutedUntil.getTime() > now.getTime();
}

// failed wins over pending: a failed job is work the platform could not do, and
// a run with one reads as failed even while other comparisons still wait. A run
// with nothing left to review and no running job is passed once it is finished,
// and still open before that.
export function decideRunState(
  counts: RunGateCounts,
  run: { finishedAt: Date | null },
): RunState {
  if (counts.failedJobs > 0) return 'failed';
  if (reviewablePendingCount(counts) > 0 || counts.pendingJobs > 0) {
    return 'pending';
  }
  return run.finishedAt ? 'passed' : 'open';
}
