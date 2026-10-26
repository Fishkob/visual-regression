import {
  decideRunState,
  reviewablePendingCount,
} from '@public/visualTest/core/domain/policies/run-state.policy';

function counts(overrides: Partial<Record<string, number>> = {}) {
  return {
    pendingComparisons: 0,
    mutedPending: 0,
    pendingJobs: 0,
    failedJobs: 0,
    ...overrides,
  };
}

describe('RunStatePolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reviewablePendingCount', () => {
    it('subtracts the muted subset from the pending comparisons', () => {
      expect(
        reviewablePendingCount(
          counts({ pendingComparisons: 5, mutedPending: 2 }),
        ),
      ).toBe(3);
    });

    it('clamps at zero when the two counts race apart', () => {
      expect(
        reviewablePendingCount(
          counts({ pendingComparisons: 1, mutedPending: 2 }),
        ),
      ).toBe(0);
    });
  });

  describe('decideRunState', () => {
    it('reads as failed when a job failed, even while comparisons wait', () => {
      expect(
        decideRunState(counts({ failedJobs: 1, pendingComparisons: 2 }), {
          finishedAt: new Date(),
        }),
      ).toBe('failed');
    });

    it('reads as pending while a reviewable comparison waits', () => {
      expect(
        decideRunState(counts({ pendingComparisons: 2, mutedPending: 1 }), {
          finishedAt: new Date(),
        }),
      ).toBe('pending');
    });

    it('lets a run pass when only muted comparisons remain', () => {
      expect(
        decideRunState(counts({ pendingComparisons: 2, mutedPending: 2 }), {
          finishedAt: new Date(),
        }),
      ).toBe('passed');
    });

    it('reads as pending while a job is still running', () => {
      expect(
        decideRunState(counts({ pendingJobs: 1 }), { finishedAt: new Date() }),
      ).toBe('pending');
    });

    it('reads as open while unfinished with nothing left', () => {
      expect(decideRunState(counts(), { finishedAt: null })).toBe('open');
    });

    it('reads as passed when finished with nothing left', () => {
      expect(decideRunState(counts(), { finishedAt: new Date() })).toBe(
        'passed',
      );
    });
  });
});
