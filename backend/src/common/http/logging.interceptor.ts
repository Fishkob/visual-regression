import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { RequestContext } from '@common/logging/request-context';
import { severityForStatus } from '@common/utils/exception-status';
import { httpRoute, observeFinalStatus } from '@common/http/response-observer';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Request, Response } from 'express';

interface RequestWithTrace extends Request {
  traceId?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly tracer = trace.getTracer('http-interceptor');

  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const req = context.switchToHttp().getRequest<RequestWithTrace>();
    const res = context.switchToHttp().getResponse<Response>();

    const route = httpRoute(req);

    const span = this.tracer.startSpan(`${req.method} ${route}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.route': route,
        'http.host': req.hostname,
      },
    });
    const spanCtx = span.spanContext();
    const traceId = spanCtx.traceId;

    req.traceId = traceId;
    req.headers['x-trace-id'] = traceId;
    res.setHeader('X-Trace-Id', traceId);

    // The record-once + status timing lifecycle is shared with the metrics
    // interceptor (see response-observer.ts) — this interceptor only owns what
    // a request's final status should produce: span + log at the right severity.
    return RequestContext.run({ traceId }, () => {
      this.logger.debug({
        msg: 'Incoming request',
        traceId,
        method: req.method,
        url: req.url,
        ip: req.ip,
      });

      return observeFinalStatus(context, next, (statusCode, err) => {
        const duration = Date.now() - start;
        if (err) {
          // Compute the message without narrowing `err` to `{}` first — the
          // base-to-string rule fires on String(object).
          const errMsg = stringifyError(err);
          span.setAttribute('http.status_code', statusCode);
          span.setAttribute('http.duration_ms', duration);
          span.setAttribute('error.message', errMsg);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errMsg,
          });
          span.end();
          // Severity derived once from the status code — the same rule the
          // exception filter uses — so a 4xx is a warn, not an error, in
          // every layer.
          const severity = severityForStatus(statusCode);
          const payload = {
            msg: 'Request failed',
            traceId,
            method: req.method,
            url: req.url,
            statusCode,
            durationMs: duration,
            error: errMsg,
          };
          if (severity === 'error') {
            this.logger.error(
              payload,
              err instanceof Error ? err.stack : stringifyError(err),
            );
          } else {
            this.logger.warn(payload);
          }
          return;
        }
        // On success Nest applies the route's effective status (e.g. 201 for a
        // POST) only in the response write that runs AFTER the interceptor's
        // tap — finalize sees the status the client actually received.
        span.setAttribute('http.status_code', statusCode);
        span.setAttribute('http.duration_ms', duration);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        this.logger.debug({
          msg: 'Request completed',
          traceId,
          method: req.method,
          url: req.url,
          statusCode,
          durationMs: duration,
        });
      });
    });
  }
}

// Stringifies an unknown error for logs without tripping no-base-to-string on
// the narrowed non-Error branch (String(object) is never useful anyway).
function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err == null) return '';
  return String(Object(err));
}
