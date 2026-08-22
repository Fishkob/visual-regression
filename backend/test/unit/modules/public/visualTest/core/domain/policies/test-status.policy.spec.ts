import {
  resolveAggregateStatusFromVariantStatuses,
  resolveVariantStatusFromComparison,
} from '@public/visualTest/core/domain/policies/test-status.policy';
import {
  ComparisonStatus,
  TestStatus,
} from '@public/visualTest/core/domain/types/visual-test.types';

describe('resolveAggregateStatusFromVariantStatuses', () => {
  it('reports PENDING_APPROVAL when any variant is pending', () => {
    expect(
      resolveAggregateStatusFromVariantStatuses([
        TestStatus.UNCHANGED,
        TestStatus.PENDING_APPROVAL,
      ]),
    ).toBe(TestStatus.PENDING_APPROVAL);
    expect(
      resolveAggregateStatusFromVariantStatuses([TestStatus.PENDING_APPROVAL]),
    ).toBe(TestStatus.PENDING_APPROVAL);
  });

  it('reports PENDING when any variant lacks a baseline', () => {
    expect(
      resolveAggregateStatusFromVariantStatuses([
        TestStatus.UNCHANGED,
        TestStatus.PENDING,
      ]),
    ).toBe(TestStatus.PENDING);
  });

  it('reports UNCHANGED only when every variant is clean', () => {
    expect(
      resolveAggregateStatusFromVariantStatuses([
        TestStatus.UNCHANGED,
        TestStatus.UNCHANGED,
      ]),
    ).toBe(TestStatus.UNCHANGED);
  });

  it('reports PENDING for a test with no variants', () => {
    expect(resolveAggregateStatusFromVariantStatuses([])).toBe(
      TestStatus.PENDING,
    );
  });
});

describe('resolveVariantStatusFromComparison', () => {
  it('reports PENDING_APPROVAL when the latest comparison is pending', () => {
    expect(
      resolveVariantStatusFromComparison(
        ComparisonStatus.PENDING_APPROVAL,
        true,
      ),
    ).toBe(TestStatus.PENDING_APPROVAL);
  });

  it('reports UNCHANGED when the latest comparison is unchanged or approved', () => {
    expect(
      resolveVariantStatusFromComparison(ComparisonStatus.UNCHANGED, true),
    ).toBe(TestStatus.UNCHANGED);
    expect(
      resolveVariantStatusFromComparison(ComparisonStatus.APPROVED, true),
    ).toBe(TestStatus.UNCHANGED);
  });

  it('reports UNCHANGED when there is no comparison but a baseline exists', () => {
    expect(resolveVariantStatusFromComparison(undefined, true)).toBe(
      TestStatus.UNCHANGED,
    );
  });

  it('reports PENDING when no baseline exists', () => {
    expect(resolveVariantStatusFromComparison(undefined, false)).toBe(
      TestStatus.PENDING,
    );
    expect(
      resolveVariantStatusFromComparison(
        ComparisonStatus.PENDING_APPROVAL,
        false,
      ),
    ).toBe(TestStatus.PENDING);
  });
});
