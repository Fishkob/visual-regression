import type { JobData } from '@common/domain/job-data.types';
import type { VariantRecord } from '@common/domain/variant-record';

export interface QueuedJob {
  id: string;
  payload: JobData;
}

export interface FailedJobRecord {
  id: string;
  testId: string;
  candidateId?: string | null;
  payload?: JobData;
  error: string | null;
  attempts: number;
  maxAttempts: number | null;
  createdAt: Date;
}

// The producer face of the job queue: the surface upload, retirement, and
// deletion paths depend on so they never import the concrete PostgresJobQueue
// from internal/job-queue. Worker mechanics (claiming, heartbeats, completion)
// stay private to the implementation, and worker-side consumption (processNext)
// lives on the separate IJobQueue face so a producer can never accidentally
// drive the processing loop.
//
// Transaction participation: enqueue / cancel* join the AMBIENT transaction
// when one is active (the Postgres adapter resolves the ALS TransactionContext
// used by StateChangeWorkflow). Callers that rely on "retire the old job +
// enqueue the new one atomically" MUST run both inside a StateChangeWorkflow
// transaction — outside one, these run on the bare connection and the atomicity
// silently disappears.
export const JOB_PRODUCER = 'JOB_PRODUCER';

export interface IJobProducer {
  enqueue(data: JobData): Promise<string>;
  cancelByTestIds(testIds: string[]): Promise<number>;
  cancelPendingForVariant(
    testId: string,
    variant: VariantRecord,
  ): Promise<number>;
  cancelPendingByCandidateIds(candidateIds: string[]): Promise<number>;
}

// The worker + ops face of the queue: drives the processing loop (processNext)
// and reports queue health. Public consumers that only produce jobs inject
// IJobProducer; this face is for the worker poller and the health checker.
export const JOB_QUEUE = 'JOB_QUEUE';

export interface IJobQueue {
  processNext(processor: (job: QueuedJob) => Promise<void>): Promise<boolean>;
  healthCheck(): Promise<{
    pending: number;
    processing: number;
    failed: number;
  }>;
}

// The job-row retention surface, one seam for the DLQ (list + retry) and the
// retention sweep (FAILED list + guarded delete + COMPLETED sweep) so the
// projection and the guarded writes live in one place instead of being
// re-derived by three consumers.
export const FAILED_JOB_STORE = 'FAILED_JOB_STORE';

export interface IFailedJobStore {
  listFailed(): Promise<FailedJobRecord[]>;
  retry(jobId: string): Promise<'retried' | 'not-found' | 'not-failed'>;
  findFailedJobs(retentionDays: number): Promise<FailedJobRecord[]>;
  deleteFailedJobRows(ids: string[]): Promise<string[]>;
  deleteCompletedJobs(retentionDays: number): Promise<number>;
}
