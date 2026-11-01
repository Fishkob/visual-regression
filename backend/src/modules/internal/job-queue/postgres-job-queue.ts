import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { TransactionContext } from '@/prisma/transaction-context';
import { Tracker } from '@common/tracker/tracker.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { context, propagation } from '@opentelemetry/api';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { METRICS, TRACKED_OPERATIONS } from '@common/domain/metrics-catalog';
import {
  decideRetry,
  isRetryableError,
  JOB_MAX_ATTEMPTS,
} from '@common/infrastructure/retry-policy';
import { decodeJobData } from '@common/domain/job-data.decoder';
import type { JobData } from '@common/domain/job-data.types';
import type { VariantRecord } from '@common/domain/variant-record';
import type {
  IJobProducer,
  IJobQueue,
} from '@common/domain/job-queue.interface';
import { JobStatus } from '@/prisma/client';
import type { Prisma } from '@/prisma/client';
import type { QueuedJob } from '@common/domain/job-queue.interface';
import { WORKER_TIMING } from '@common/utils/worker-timing';

const HEARTBEAT_INTERVAL_MS = WORKER_TIMING.heartbeatIntervalMs;
const METRICS_QUEUE_LABEL = 'comparison';

interface QueueJobRow {
  id: string;
  testId: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number | null;
  processingStartedAt: Date | null;
}

interface ClaimedJob extends QueuedJob {
  attempts: number;
  maxAttempts: number | null;
  processingStartedAt?: Date | null;
}

@Injectable()
export class PostgresJobQueue
  implements IJobProducer, IJobQueue, OnModuleDestroy
{
  private readonly timers = new Map<
    string,
    {
      interval: ReturnType<typeof setInterval>;
      processingStartedAt?: Date | null;
    }
  >();

  constructor(
    private readonly txCtx: TransactionContext,
    private readonly tracker: Tracker,
    private readonly logger: AppLoggerService,
    @Inject(METRICS_RECORDER) private readonly metrics: IMetricsRecorder,
  ) {}

  private toClaimedJob(row: QueueJobRow): ClaimedJob {
    return {
      id: row.id,
      payload: decodeJobData(row.payload),
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      processingStartedAt: row.processingStartedAt ?? undefined,
    };
  }

  onModuleDestroy(): void {
    for (const { interval } of this.timers.values()) {
      clearInterval(interval);
    }
    this.timers.clear();
  }

  async enqueue(data: JobData): Promise<string> {
    this.txCtx.assertInTransaction();
    const testId = data.testId;
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    const dataWithTrace = { ...data, traceContext: carrier };

    return this.tracker.track(TRACKED_OPERATIONS.queueEnqueue, async () => {
      const job = await this.txCtx.client.comparisonJob.create({
        data: {
          testId,
          runId: data.runId ?? null,
          runKey: data.runKey ?? null,
          payload: dataWithTrace,
          candidateId: data.candidate.id,
          variantViewport: data.variant.viewport,
          variantBrowser: data.variant.browser,
          variantEnvironment: data.variant.environment,
          maxAttempts: JOB_MAX_ATTEMPTS,
        },
      });

      return job.id;
    });
  }

  async cancelByTestIds(testIds: string[]): Promise<number> {
    this.txCtx.assertInTransaction();
    if (testIds.length === 0) return 0;
    const result = await this.txCtx.client.comparisonJob.deleteMany({
      where: { testId: { in: testIds }, status: JobStatus.PENDING },
    });
    return result.count;
  }

  async cancelPendingForVariant(
    testId: string,
    variant: VariantRecord,
  ): Promise<number> {
    this.txCtx.assertInTransaction();
    const result = await this.txCtx.client.comparisonJob.deleteMany({
      where: {
        testId,
        status: JobStatus.PENDING,
        variantViewport: variant.viewport,
        variantBrowser: variant.browser,
        variantEnvironment: variant.environment,
      },
    });
    return result.count;
  }

  async cancelPendingByCandidateIds(candidateIds: string[]): Promise<number> {
    this.txCtx.assertInTransaction();
    if (candidateIds.length === 0) return 0;
    const result = await this.txCtx.client.comparisonJob.deleteMany({
      where: {
        status: JobStatus.PENDING,
        candidateId: { in: candidateIds },
      },
    });
    return result.count;
  }

  async claimNext(): Promise<ClaimedJob | null> {
    const claimed = await this.txCtx.client.$transaction(async (tx) => {
      const stallThreshold = new Date(
        Date.now() - WORKER_TIMING.stallTimeoutSeconds * 1000,
      );

      // Two claims instead of one `status = PENDING OR status = PROCESSING`
      // query: the OR form cannot use a single ordered index, so it fell back to
      // scanning "ComparisonJob" in createdAt order and filtering away every
      // finished row (measured: 200k rows removed, ~20 ms per claim at 200k
      // retained jobs). Each branch now has an equality prefix and can walk an
      // index in createdAt order and stop at the first match. Stalled jobs are
      // tried first because they are the oldest work: they were claimed before
      // any pending row.
      const claim = `
        SELECT id, status, attempts, "maxAttempts" FROM "ComparisonJob"
         WHERE status = $1
           AND %CONDITION%
         ORDER BY "createdAt"
         LIMIT 1
         FOR UPDATE SKIP LOCKED`;

      const stalled = await tx.$queryRawUnsafe<
        {
          id: string;
          status: JobStatus;
          attempts: number;
          maxAttempts: number | null;
        }[]
      >(
        claim.replace(
          '%CONDITION%',
          `("heartbeatAt" IS NULL OR "heartbeatAt" < $2)`,
        ),
        JobStatus.PROCESSING,
        stallThreshold,
      );

      interface ClaimRow {
        id: string;
        status: JobStatus;
        attempts: number;
        maxAttempts: number | null;
      }

      const claimPending = (): Promise<ClaimRow[]> =>
        tx.$queryRawUnsafe<ClaimRow[]>(
          claim.replace(
            '%CONDITION%',
            `("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())`,
          ),
          JobStatus.PENDING,
        );

      let row: ClaimRow | undefined = stalled[0];

      // A stalled job that already burned its budget is failed here and the
      // claim falls through to the pending branch: returning "no job" would
      // leave a claimable row waiting behind the poller's exponential backoff.
      if (row) {
        const stalledMaxAttempts = row.maxAttempts ?? JOB_MAX_ATTEMPTS;
        if (decideRetry(row.attempts, stalledMaxAttempts).action === 'failed') {
          await tx.comparisonJob.update({
            where: { id: row.id },
            data: {
              status: JobStatus.FAILED,
              attempts: row.attempts + 1,
              error: 'Job stalled and exhausted its retry budget',
              completedAt: new Date(),
            },
          });
          row = undefined;
        }
      }

      row ??= (await claimPending())[0];

      if (!row) return null;

      const isStalledReclaim = row.status === JobStatus.PROCESSING;
      const nextAttempts = row.attempts + (isStalledReclaim ? 1 : 0);

      await tx.comparisonJob.update({
        where: { id: row.id },
        data: {
          status: JobStatus.PROCESSING,
          processingStartedAt: new Date(),
          heartbeatAt: new Date(),
          ...(isStalledReclaim ? { attempts: nextAttempts } : {}),
        },
      });

      const job = await tx.comparisonJob.findUnique({
        where: { id: row.id },
      });
      return job ?? null;
    });

    if (!claimed) return null;

    try {
      return this.toClaimedJob(claimed);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.markFailed(
        claimed.id,
        `Failed to decode job payload: ${error.message}`,
        claimed.attempts,
        claimed.maxAttempts,
        claimed.processingStartedAt ?? undefined,
        false,
      );
      return null;
    }
  }

  async processNext(
    processor: (job: QueuedJob) => Promise<void>,
  ): Promise<boolean> {
    const job = await this.claimNext();
    if (!job) return false;
    await this.runJob(job, processor);
    return true;
  }

  async healthCheck(): Promise<{
    pending: number;
    processing: number;
    failed: number;
  }> {
    const [pending, processing, failed] = await Promise.all([
      this.txCtx.client.comparisonJob.count({
        where: { status: JobStatus.PENDING },
      }),
      this.txCtx.client.comparisonJob.count({
        where: { status: JobStatus.PROCESSING },
      }),
      this.txCtx.client.comparisonJob.count({
        where: { status: JobStatus.FAILED },
      }),
    ]);
    this.metrics.setGauge(METRICS.queueFailedJobs, failed, {
      queue: METRICS_QUEUE_LABEL,
    });
    return { pending, processing, failed };
  }

  async markCompleted(
    jobId: string,
    processingStartedAt?: Date | null,
  ): Promise<void> {
    const result = await this.txCtx.client.comparisonJob.updateMany({
      where: this.ownershipGuard(jobId, processingStartedAt),
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        error: null,
      },
    });
    this.recordOwnershipLoss(result.count);
  }

  async markFailed(
    jobId: string,
    error: string,
    attempts: number,
    maxAttempts: number | null,
    processingStartedAt?: Date | null,
    retryable = true,
  ): Promise<'retry' | 'failed'> {
    const decision = decideRetry(attempts, maxAttempts);
    if (!retryable || decision.action === 'failed') {
      const result = await this.txCtx.client.comparisonJob.updateMany({
        where: this.ownershipGuard(jobId, processingStartedAt),
        data: {
          status: JobStatus.FAILED,
          attempts: attempts + 1,
          error,
          completedAt: new Date(),
        },
      });
      this.recordOwnershipLoss(result.count);
      return 'failed';
    }
    const result = await this.txCtx.client.comparisonJob.updateMany({
      where: this.ownershipGuard(jobId, processingStartedAt),
      data: {
        status: JobStatus.PENDING,
        attempts: attempts + 1,
        nextAttemptAt: decision.nextAttemptAt,
        error: null,
      },
    });
    this.recordOwnershipLoss(result.count);
    return 'retry';
  }

  // The "this worker still owns this PROCESSING job" predicate, single-sourced:
  // markCompleted, markFailed, and the heartbeat all mutate only if the row is
  // PROCESSING and its processingStartedAt still matches. A change to ownership
  // semantics (a workerId column, matching on heartbeatAt) is one edit here.
  private ownershipGuard(
    jobId: string,
    processingStartedAt?: Date | null,
  ): Prisma.ComparisonJobWhereInput {
    return {
      id: jobId,
      status: JobStatus.PROCESSING,
      ...(processingStartedAt ? { processingStartedAt } : {}),
    };
  }

  private recordOwnershipLoss(matched: number): boolean {
    if (matched === 0) {
      this.metrics.incrementCounter(METRICS.queueOwnershipLossTotal, {
        queue: METRICS_QUEUE_LABEL,
      });
      return true;
    }
    return false;
  }

  private startHeartbeat(
    jobId: string,
    processingStartedAt?: Date | null,
  ): void {
    const interval = setInterval(() => {
      void this.sendHeartbeat(jobId, processingStartedAt);
    }, HEARTBEAT_INTERVAL_MS);
    this.timers.set(jobId, { interval, processingStartedAt });
  }

  private async sendHeartbeat(
    jobId: string,
    processingStartedAt?: Date | null,
  ): Promise<void> {
    try {
      const result = await this.txCtx.client.comparisonJob.updateMany({
        where: this.ownershipGuard(jobId, processingStartedAt),
        data: { heartbeatAt: new Date() },
      });
      if (this.recordOwnershipLoss(result.count)) {
        this.logger.warn(`Lost ownership of job ${jobId}; stopping heartbeat`);
        this.stopHeartbeat(jobId);
      }
    } catch (err) {
      // A run of heartbeat failures widens the window for a stall-reclaim
      // double-process, so the failure is surfaced (not swallowed): count it
      // and log it once per interval, without crashing the worker.
      this.metrics.incrementCounter(METRICS.queueHeartbeatFailuresTotal, {
        queue: METRICS_QUEUE_LABEL,
      });
      this.logger.warn(`Heartbeat failed for job ${jobId}`, {
        error: String(err),
      });
    }
  }

  private stopHeartbeat(jobId: string): void {
    const entry = this.timers.get(jobId);
    if (entry) {
      clearInterval(entry.interval);
      this.timers.delete(jobId);
    }
  }

  private async runJob(
    job: ClaimedJob,
    processor: (job: QueuedJob) => Promise<void>,
  ): Promise<void> {
    this.startHeartbeat(job.id, job.processingStartedAt);
    try {
      // Only the processor failing is a job failure. Once it resolved, its
      // transaction has committed, so re-queuing on a bookkeeping error would
      // re-run the diff: a second comparison (retiring the first, deleting its
      // diff object) and a second `review.requested` event.
      try {
        await processor(job);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await this.markFailed(
          job.id,
          error.message,
          job.attempts,
          job.maxAttempts,
          job.processingStartedAt,
          isRetryableError(err),
        );
        return;
      }

      try {
        await this.markCompleted(job.id, job.processingStartedAt);
      } catch (err) {
        this.logger.error(
          `Job completed but bookkeeping write failed; not re-queuing to avoid duplicate side effects: job ${job.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    } finally {
      this.stopHeartbeat(job.id);
    }
  }
}
