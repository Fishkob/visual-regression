import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  IMetricsRecorder,
  METRICS_RECORDER,
} from '@common/domain/metrics-recorder.interface';
import { METRICS } from '@common/domain/metrics-catalog';
import { httpRoute, observeFinalStatus } from '@common/http/response-observer';
import type { Request } from 'express';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(METRICS_RECORDER) private readonly metrics: IMetricsRecorder,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const route = httpRoute(req, 'unmatched');
    const start = Date.now();

    // The record-once + status timing lifecycle is shared with the logging
    // interceptor (see response-observer.ts) — this interceptor only owns what
    // a request's final status should record into the metrics registry.
    return observeFinalStatus(context, next, (status) => {
      const duration = Date.now() - start;
      const statusStr = status.toString();
      this.metrics.observeHistogram(METRICS.httpRequestDuration, duration, {
        method: req.method,
        route,
        status: statusStr,
      });
      this.metrics.incrementCounter(METRICS.httpRequestsTotal, {
        method: req.method,
        route,
        status: statusStr,
      });
    });
  }
}
