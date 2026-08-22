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
    this.health.recordPoll();
    let didProcessJob = false;

    try {
      didProcessJob = await this.runNextJob();
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

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for the current in-flight job to complete
    if (this.inFlight) {
      await this.inFlight;
      this.inFlight = null;
    }

    // Drain loop: process remaining PENDING jobs until empty or timeout
    const deadline = Date.now() + WORKER_TIMING.drainTimeoutMs;
    let drained = 0;

    while (Date.now() < deadline) {
      try {
        const didHaveJob = await this.runNextJob();
        if (!didHaveJob) break;
        drained++;
      } catch (err: unknown) {
        this.logger.error(
          'Drain cycle failed',
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    if (drained > 0) {
      this.logger.log(`Worker drained ${drained} jobs before shutdown`);
    }
  }
}
