import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { JOB_QUEUE, IJobQueue } from '@common/domain/job-queue.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import {
  WORKER_HEALTH,
  IWorkerHealth,
} from '@common/domain/worker-health.interface';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import { WORKER_TIMING } from '@common/utils/worker-timing';

// Poll backoff bounds, the drain bound, and the liveness-heartbeat interval all
// come from the single worker-timing budget (WORKER_TIMING) so the poller's
// deadlines cannot drift from the health server's stall threshold or the
// queue's reclaim window.

@Injectable()
export class ComparisonJobPoller
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private currentPollInterval: number = WORKER_TIMING.minPollIntervalMs;
  private inFlight: Promise<void> | null = null;
  private shuttingDown = false;

  constructor(
    @Inject(JOB_QUEUE) private readonly queue: IJobQueue,
    private readonly processor: ComparisonJobProcessor,
    @Inject(WORKER_HEALTH) private readonly health: IWorkerHealth,
    private readonly logger: AppLoggerService,
  ) {}

  onApplicationBootstrap(): void {
    this.scheduleNext();
    this.logger.log('ComparisonJobPoller started');
  }

  private scheduleNext(): void {
    if (this.shuttingDown) return;

    this.pollTimer = setTimeout(() => {
      this.inFlight = this.pollOnce();
    }, this.currentPollInterval);
  }

  private async pollOnce(): Promise<void> {
    let didProcessJob = false;

    try {
      didProcessJob = await this.runNextJob();
      // Liveness advances only once the queue answered. Recording it before the
      // claim made a worker whose claims keep failing (revoked DB grants, a
      // wedged connection) look healthy forever: /health stayed `ok`, so the
      // liveness probe never restarted it and the queue silently stopped.
      this.health.recordPoll();
    } catch (err: unknown) {
      this.logger.error(
        'Poll cycle failed',
        err instanceof Error ? err.stack : String(err),
      );
    }

    if (didProcessJob) {
      this.health.recordJobProcessed();
    }

    this.currentPollInterval = didProcessJob
      ? WORKER_TIMING.minPollIntervalMs
      : Math.min(this.currentPollInterval * 2, WORKER_TIMING.maxPollIntervalMs);

    if (!this.shuttingDown) {
      this.scheduleNext();
    }
  }

  private runNextJob(): Promise<boolean> {
    // While a job is in flight, keep the worker-health poll liveness fresh —
    // otherwise a job longer than the 150s threshold flips /health to `error`
    // for a perfectly healthy worker. Cleared as soon as the cycle ends.
    const heartbeat = setInterval(() => {
      this.health.recordPoll();
    }, WORKER_TIMING.workerHealthHeartbeatMs);
    return this.queue
      .processNext((job) => this.processor.processJob(job))
      .finally(() => {
        clearInterval(heartbeat);
      });
  }

  // Stops claiming new work. The e2e harness calls this right after boot: the
  // suite drives queued jobs itself (`drainJobs`/the processor), and a live
  // poller claims those same jobs from under a test — a comparison job that
  // finished mid-vote retired the comparison the reviewers were voting on.
  stop(): void {
    this.shuttingDown = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stop();

    // No job is claimed while shutting down. The previous drain loop claimed
    // fresh work with the remaining budget — work the process would be killed
    // in the middle of, turning a clean deploy into a phantom attempt when the
    // row is reclaimed. Queued jobs stay PENDING and are picked up by another
    // replica or after the restart.
    //
    // The in-flight job gets the drain budget, never more: an unbounded wait
    // outlives the container's stop grace period and ends in SIGKILL anyway,
    // which is strictly worse than exiting cleanly (the row is reclaimed after
    // the stall timeout either way).
    if (this.inFlight) {
      await this.waitForInFlightJob();
      this.inFlight = null;
    }
  }

  private async waitForInFlightJob(): Promise<void> {
    const inFlight = this.inFlight;
    if (!inFlight) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const didTimeOut = await Promise.race([
      inFlight.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          resolve(true);
        }, WORKER_TIMING.drainTimeoutMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });

    if (didTimeOut) {
      this.logger.warn(
        `In-flight job did not finish within ${String(WORKER_TIMING.drainTimeoutMs)}ms; leaving it to stall reclaim`,
      );
    }
  }
}
