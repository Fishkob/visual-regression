// The queue's failure path writes its own terminal row: there is no
// StateChangeWorkflow transaction to ride, so a consumer that must hear about a
// dead comparison cannot be called from inside one. The seam is an observer list
// instead — the queue publishes the failure through this token, an adapter in the
// notification layer turns it into an outbox row, and neither imports the other
// (ADR-076).
export const JOB_FAILURE_OBSERVERS = 'JOB_FAILURE_OBSERVERS';

// What the queue knows when a job reaches FAILED for good. Deliberately the raw
// facts, not a rendered message: the observer decides whether the failure is
// worth a notification and how to name it.
export interface FailedJobNotice {
  jobId: string;
  testId: string;
  error: string;
  // The attempt count AFTER the terminal failure, i.e. the budget that was spent.
  attempts: number;
  maxAttempts: number;
  runKey: string | null;
}

export interface IJobFailureObserver {
  onJobFailed(notice: FailedJobNotice): Promise<void>;
}
