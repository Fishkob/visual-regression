import { Inject, Injectable } from '@nestjs/common';
import {
  IMetricsRecorder,
  METRICS_RECORDER,
} from '@common/domain/metrics-recorder.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
@Injectable()
export class Tracker {
  constructor(
    @Inject(METRICS_RECORDER) private readonly metrics: IMetricsRecorder,
    private readonly logger: AppLoggerService,
  ) {}

  async track<T>(
    operation: string,
    fn: () => Promise<T>,
    meta?: Record<string, unknown>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.metrics.observeHistogram(`${operation}_duration_ms`, duration);
      this.metrics.incrementCounter(`${operation}_total`, {
        status: 'success',
      });
      this.logger.log(`Operation ${operation} succeeded`, {
        duration,
        ...meta,
      });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      this.metrics.observeHistogram(`${operation}_duration_ms`, duration);
      this.metrics.incrementCounter(`${operation}_total`, {
        status: 'failure',
      });
      this.metrics.incrementCounter(`${operation}_errors_total`);
      this.logger.error(
        `Operation ${operation} failed`,
        err instanceof Error ? err.stack : String(err),
        { duration, ...meta },
      );
      throw err;
    }
  }
}
