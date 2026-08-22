import { CallHandler, ExecutionContext } from '@nestjs/common';
import { finalize, Observable, tap } from 'rxjs';
import { finalHttpStatus } from '@common/utils/exception-status';
import type { Request, Response } from 'express';

// The shared "observe the final response status exactly once" lifecycle used by
// both the logging and metrics interceptors. The timing knowledge lives here:
// an error records finalHttpStatus(err) (the filter's 400→422 promotion must be
// visible to dashboards and logs), a success records res.statusCode at finalize
// (Nest applies the route's effective status only in the response write AFTER
// the interceptor's tap, so finalize is the only place that sees the real
// status), and the didRecord guard guarantees exactly one record per request.
export function observeFinalStatus(
  context: ExecutionContext,
  next: CallHandler,
  onStatus: (status: number, error?: unknown) => void,
): Observable<unknown> {
  const res = context.switchToHttp().getResponse<Response>();
  let didRecord = false;
  const record = (status: number, error?: unknown): void => {
    if (didRecord) return;
    didRecord = true;
    onStatus(status, error);
  };
  return next.handle().pipe(
    tap({
      error: (err: unknown) => {
        record(finalHttpStatus(err), err);
      },
    }),
    finalize(() => {
      record(res.statusCode ?? 200);
    }),
  );
}

// The route the request matched, or the fallback when the handler is not a
// route (e.g. unmatched paths). Shared so the two interceptors cannot compute
// the recorded route differently.
export function httpRoute(
  req: Request,
  unmatchedFallback: string = req.path,
): string {
  const routePath = (req.route as { path?: string } | undefined)?.path ?? '';
  return routePath ? req.baseUrl + routePath : unmatchedFallback;
}
