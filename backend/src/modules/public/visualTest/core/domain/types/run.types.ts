export type RunState = 'open' | 'pending' | 'failed' | 'passed';

export interface RunStatusCounts {
  pendingComparisons: number;
  pendingJobs: number;
  failedJobs: number;
  approved: number;
  testCount: number;
}

export interface RunStatus extends RunStatusCounts {
  state: RunState;
}
