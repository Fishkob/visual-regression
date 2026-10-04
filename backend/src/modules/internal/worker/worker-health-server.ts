import http from 'node:http';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import {
  METRICS_API_KEY_HEADER,
  hasMetricsApiKey,
  isValidMetricsApiKey,
} from '@internal/metrics/metrics-auth.guard';
import { WORKER_TIMING } from '@common/utils/worker-timing';
import type {
  WorkerHealthPayload,
  WorkerHealthState,
} from '@common/domain/worker-health.type';

@Injectable()
export class WorkerHealthServer implements OnApplicationShutdown {
  private server: http.Server;
  private started = false;
  private state: WorkerHealthState = {
    lastJobProcessedAt: null,
    lastPollAt: null,
    jobsProcessed: 0,
    startTime: Date.now(),
  };
  private readonly port: number;
  private readonly metricsApiKey: string;

  constructor(
    private readonly logger: AppLoggerService,
    appConfig: AppConfigService,
    @Inject(METRICS_RECORDER) private readonly metrics?: IMetricsRecorder,
  ) {
    this.port = appConfig.workerHealth.port;
    this.metricsApiKey = appConfig.metrics.apiKey;
    this.server = http.createServer((req, res) => {
      const url = req.url ?? '';
      if (url === '/health' || url === '/api/v1/health') {
        const payload: WorkerHealthPayload = {
          status: this.deriveStatus(),
          uptime: Math.floor((Date.now() - this.state.startTime) / 1000),
          lastJobProcessedAt: this.state.lastJobProcessedAt,
          lastPollAt: this.state.lastPollAt,
          jobsProcessed: this.state.jobsProcessed,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      } else if (url === '/metrics' || url === '/api/v1/metrics') {
        // The diff histograms and queue counters only ever live in the worker's
        // process-local registry — the API process never sees the worker's
        // events. Scrape them from the worker's own health port instead of
        // collecting into a registry nobody reads.
        void this.serveMetrics(req, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  }

  recordPoll(): void {
    this.state.lastPollAt = new Date().toISOString();
  }

  recordJobProcessed(): void {
    this.state.jobsProcessed++;
    this.state.lastJobProcessedAt = new Date().toISOString();
    this.recordPoll();
  }

  // A null lastPollAt uses startTime as the reference, so a freshly started
  // worker stays ok until it misses the threshold (startup grace window).
  private deriveStatus(): WorkerHealthPayload['status'] {
    const referenceMs = this.state.lastPollAt
      ? Date.parse(this.state.lastPollAt)
      : this.state.startTime;
    return Date.now() - referenceMs > WORKER_TIMING.pollStallThresholdMs
      ? 'error'
      : 'ok';
  }

  private async serveMetrics(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    // Same auth rule as the API /metrics route (see MetricsAuthGuard): the
    // shared helpers own the header name, comparison, and disabled behavior so
    // the bare http handler doesn't drift from the Nest guard.
    if (
      !hasMetricsApiKey(this.metricsApiKey) ||
      !isValidMetricsApiKey(
        req.headers[METRICS_API_KEY_HEADER],
        this.metricsApiKey,
      )
    ) {
      res.writeHead(401);
      res.end();
      return;
    }
    const body = this.metrics ? await this.metrics.getPrometheusMetrics() : '';
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(body);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        this.started = true;
        this.logger.log(`Worker health server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }
}
