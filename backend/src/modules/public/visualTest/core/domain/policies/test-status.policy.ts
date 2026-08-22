import {
  ComparisonStatus,
  TestStatus,
} from '@public/visualTest/core/domain/types/visual-test.types';

// Per-variant rule for the read model: a variant with a baseline is UNCHANGED
// unless its latest comparison is pending review. A variant without a baseline
// is PENDING.
export function resolveVariantStatusFromComparison(
  latestStatus: ComparisonStatus | undefined,
  hasBaseline: boolean,
): TestStatus {
  if (!hasBaseline) return TestStatus.PENDING;
  if (latestStatus === ComparisonStatus.PENDING_APPROVAL) {
    return TestStatus.PENDING_APPROVAL;
  }
  return TestStatus.UNCHANGED;
}

// Aggregate rule used to persist the test row, derived FROM the per-variant
// rule so the persisted status and the per-variant read model can never drift:
// any pending variant makes the whole test PENDING_APPROVAL, any incomplete
// (no-baseline) variant makes it PENDING, and only a test where every variant
// is clean reads UNCHANGED. A test with no variants at all has no baseline
// coverage and reads PENDING.
export function resolveAggregateStatusFromVariantStatuses(
  variantStatuses: readonly TestStatus[],
): TestStatus {
  if (variantStatuses.length === 0) return TestStatus.PENDING;
  if (variantStatuses.includes(TestStatus.PENDING_APPROVAL)) {
    return TestStatus.PENDING_APPROVAL;
  }
  if (variantStatuses.includes(TestStatus.PENDING)) {
    return TestStatus.PENDING;
  }
  return TestStatus.UNCHANGED;
}
