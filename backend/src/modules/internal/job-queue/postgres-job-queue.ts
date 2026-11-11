import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
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
  delay,
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
import {
  JOB_FAILURE_OBSERVERS,
  type FailedJobNotice,
  type IJobFailureObserver,
} from '@common/domain/job-failure.interface';
import { WORKER_TIMING } from '@common/utils/worker-timing';

const HEARTBEAT_INTERVAL_MS = WORKER_TIMING.heartbeatIntervalMs;
const METRICS_QUEUE_LABEL = 'comparison';

// A job is only worth a notification once it can never run again. The fields are
// the ones the terminal write already has; `testId` and `runKey` are read back
// from the row so every terminal path (worker failure, stalled reclaim, decode
// failure) publishes the same shape.
interface TerminalFailure {
  jobId: string;
  error: string;
  attempts: number;
  maxAttempts: number;
}

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
    // Optional on purpose: the queue works without a listener (API process,
    // tests), and the adapter is provided by the notification module. The queue
    // imports the token, never the webhook code (ADR-076).
    @Optional()
    @Inject(JOB_FAILURE_OBSERVERS)
    private readonly failureObservers: IJobFailureObserver[] = [],
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
    const { job: claimed, exhausted } = await this.txCtx.client.$transaction(
      async (tx) => {
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
        // Claimed failures are returned instead of notified inside the
        // transaction: the observer writes through the ambient context, and there
        // must be no ambient transaction left when it does (ADR-076).
        let exhaustedJob: TerminalFailure | null = null;

        // A stalled job that already burned its budget is failed here and the
        // claim falls through to the pending branch: returning "no job" would
        // leave a claimable row waiting behind the poller's exponential backoff.
        if (row) {
          const stalledMaxAttempts = row.maxAttempts ?? JOB_MAX_ATTEMPTS;
          if (
            decideRetry(row.attempts, stalledMaxAttempts).action === 'failed'
          ) {
            const error = 'Job stalled and exhausted its retry budget';
            await tx.comparisonJob.update({
              where: { id: row.id },
              data: {
                status: JobStatus.FAILED,
                attempts: row.attempts + 1,
                error,
                completedAt: new Date(),
              },
            });
            exhaustedJob = {
              jobId: row.id,
              error,
              attempts: row.attempts + 1,
              maxAttempts: stalledMaxAttempts,
            };
            row = undefined;
          }
        }

        row ??= (await claimPending())[0];

        if (!row) return { job: null, exhausted: exhaustedJob };

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
        return { job: job ?? null, exhausted: exhaustedJob };
      },
    );

    if (exhausted) await this.notifyFailure(exhausted);
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
    const [pending, processing, failed, oldestPending] = await Promise.all([
      this.txCtx.client.comparisonJob.count({
        where: { status: JobStatus.PENDING },
      }),
      this.txCtx.client.comparisonJob.count({
        where: { status: JobStatus.PROCESSING },
      }),
      this.txCtx.client.comparisonJob.count({
        where: { status: JobStatus.FAILED },
      }),
      // Oldest queued work, not the oldest row: a backlog is only visible as an
      // age when a pending job sits unclaimed for minutes. `nextAttemptAt`
      // delays are excluded so a scheduled retry does not read as a stuck queue.
      this.txCtx.client.comparisonJob.findFirst({
        where: {
          status: JobStatus.PENDING,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const oldestPendingAgeSeconds = oldestPending
      ? Math.max(0, (Date.now() - oldestPending.createdAt.getTime()) / 1000)
      : 0;
    this.metrics.setGauge(METRICS.queueFailedJobs, failed, {
      queue: METRICS_QUEUE_LABEL,
    });
    this.metrics.setGauge(METRICS.queuePendingJobs, pending, {
      queue: METRICS_QUEUE_LABEL,
    });
    this.metrics.setGauge(METRICS.queueProcessingJobs, processing, {
      queue: METRICS_QUEUE_LABEL,
    });
    this.metrics.setGauge(
      METRICS.queueOldestPendingAgeSeconds,
      oldestPendingAgeSeconds,
      { queue: METRICS_QUEUE_LABEL },
    );
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
      // Only a failure this worker actually committed is published: a guard that
      // matched nothing means the row was reclaimed or finished elsewhere.
      if (result.count > 0) {
        await this.notifyFailure({
          jobId,
          error,
          attempts: attempts + 1,
          maxAttempts: maxAttempts ?? JOB_MAX_ATTEMPTS,
        });
      }
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

  // The durable record of a dead comparison is its FAILED row; the notification
  // is published after that write commits, through the observers, in their own
  // transaction (there is no domain transaction here to ride — ADR-076). An
  // observer that throws is logged, never rethrown: a notification must not undo
  // or delay the failure it reports.
  private async notifyFailure(failure: TerminalFailure): Promise<void> {
    if (this.failureObservers.length === 0) return;
    try {
      const row = await this.txCtx.client.comparisonJob.findUnique({
        where: { id: failure.jobId },
        select: { testId: true, payload: true },
      });
      if (!row) return;
      const notice: FailedJobNotice = {
        jobId: failure.jobId,
        testId: row.testId,
        error: failure.error,
        attempts: failure.attempts,
        maxAttempts: failure.maxAttempts,
        // Read tolerantly instead of through decodeJobData: the decode-failure
        // path is itself a failure worth reporting, and its payload is exactly
        // the one the decoder rejects.
        runKey: runKeyOf(row.payload),
      };
      for (const observer of this.failureObservers) {
        try {
          await observer.onJobFailed(notice);
        } catch (err) {
          this.logger.warn(
            `Job failure observer failed for job ${failure.jobId}`,
            { error: String(err) },
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to publish the failure of job ${failure.jobId}`,
        { error: String(err) },
      );
    }
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
        await this.runWithinDeadline(job, processor);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (err instanceof JobDeadlineExceededError) {
          this.metrics.incrementCounter(METRICS.queueJobTimeoutsTotal, {
            queue: METRICS_QUEUE_LABEL,
          });
          this.logger.error(
            `Job ${job.id} exceeded its ${String(WORKER_TIMING.jobTimeoutMs)} ms deadline; failing it for reclaim`,
          );
        }
        await this.markFailed(
          job.id,
          error.message,
          job.attempts,
          job.maxAttempts,
          job.processingStartedAt,
          err instanceof JobDeadlineExceededError || isRetryableError(err),
        );
        return;
      }

      await this.completeWithRetries(job);
    } finally {
      this.stopHeartbeat(job.id);
    }
  }

  // A comparison that never settles (a wedged storage call, a hung sidecar)
  // used to hold the only worker forever: the row heartbeat kept its lease
  // alive and the poller's liveness heartbeat kept /health `ok`, so nothing
  // noticed. The deadline turns that into a normal retryable failure and stops
  // the heartbeat, which lets the stall reclaim take over.
  //
  // The handler keeps running after the deadline (JavaScript cannot cancel a
  // pending promise). Its late rejection is absorbed here instead of becoming
  // an unhandled rejection; a late commit cannot resurrect the job because
  // every ownership write matches `processingStartedAt`, and the processor's
  // diff path refuses to persist when an earlier attempt already left a
  // pending comparison for the candidate.
  private async runWithinDeadline(
    job: ClaimedJob,
    processor: (job: QueuedJob) => Promise<void>,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hasTimedOut = false;
    const deadline = new Promise<never>((resolve, reject) => {
      timer = setTimeout(() => {
        hasTimedOut = true;
        reject(
          new JobDeadlineExceededError(job.id, WORKER_TIMING.jobTimeoutMs),
        );
      }, WORKER_TIMING.jobTimeoutMs);
      timer.unref?.();
    });

    const work = processor(job);
    const observed = work.then(
      () => undefined,
      (err: unknown) => {
        if (!hasTimedOut) throw err;
        this.logger.warn(`Job ${job.id} failed after its deadline`, {
          error: String(err),
        });
      },
    );

    try {
      await Promise.race([observed, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  // Bookkeeping is retried instead of swallowed: a transient write failure is
  // exactly the case a second attempt fixes. Only after all attempts fail does
  // the row stay PROCESSING (and the stall reclaim re-run it); the processor's
  // duplicate guard makes that re-run a no-op for an already-persisted diff.
  private async completeWithRetries(job: ClaimedJob): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.markCompleted(job.id, job.processingStartedAt);
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          this.metrics.incrementCounter(METRICS.queueBookkeepingFailuresTotal, {
            queue: METRICS_QUEUE_LABEL,
          });
          this.logger.error(
            `Job ${job.id} completed but its bookkeeping write failed after ${String(maxAttempts)} attempts; a stall reclaim will re-run it`,
            err instanceof Error ? err.stack : String(err),
          );
          return;
        }
        await delay(200 * attempt);
      }
    }
  }
}

// Own class so the timeout is distinguishable from a processor failure in the
// retry decision (`instanceof` is the single test, no string matching).
export class JobDeadlineExceededError extends Error {
  constructor(jobId: string, timeoutMs: number) {
    super(`Job ${jobId} exceeded its ${timeoutMs} ms deadline`);
    this.name = 'JobDeadlineExceededError';
  }
}

// The run key is optional and lives in the JSON payload; a row whose payload is
// malformed (the decode-failure case) still yields "no run".
function runKeyOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const runKey = (payload as { runKey?: unknown }).runKey;
  return typeof runKey === 'string' ? runKey : null;
}
