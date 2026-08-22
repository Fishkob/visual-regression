import type { HealthCheckResult } from '@common/domain/health-result.type';
import { withTimeout } from '@common/utils/with-timeout';

export type ProbeResult<T> =
  | { ok: true; elapsedMs: number; value: T }
  | { ok: false; elapsedMs: number; error: string };

export interface ProbeOptions {
  timeoutMs?: number;
}

export async function probe<T>(
  fn: () => Promise<T>,
  options: ProbeOptions = {},
): Promise<ProbeResult<T>> {
  const { timeoutMs } = options;
  const start = Date.now();
  try {
    const work = fn();
    const value = timeoutMs
      ? await withTimeout(
          work,
          timeoutMs,
          () => new Error(`Health probe timed out after ${timeoutMs}ms`),
        )
      : await work;
    return { ok: true, elapsedMs: Date.now() - start, value };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface HttpProbeResult {
  ok: boolean;
  elapsedMs: number;
  httpStatus: number | null;
  message?: string;
  body?: Record<string, unknown>;
}

export async function probeHealthUrl(
  url: string,
  timeoutMs = 3000,
): Promise<HttpProbeResult> {
  const start = Date.now();
  try {
    // AbortSignal aborts the underlying fetch, which withTimeout cannot do.
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const elapsedMs = Date.now() - start;
    if (!res.ok) {
      return {
        ok: false,
        elapsedMs,
        httpStatus: res.status,
        message: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return { ok: true, elapsedMs, httpStatus: res.status, body };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - start,
      httpStatus: null,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface HttpEndpointHealthOptions {
  name: string;
  healthyStatus: string;
  statusFromBody: (body: Record<string, unknown>) => string | undefined;
  details?: (body: Record<string, unknown>) => Record<string, unknown>;
}

// Shared shape for HTTP-probe health indicators: probe a /health URL and map
// the result to a HealthCheckResult. Both HTTP-level failures (non-2xx) and
// body-level status mismatches are errors; a connection failure keeps the
// underlying error in details.
export async function httpEndpointHealthCheck(
  url: string,
  options: HttpEndpointHealthOptions,
): Promise<HealthCheckResult> {
  const result = await probeHealthUrl(url);

  if (!result.ok) {
    return result.httpStatus !== null
      ? {
          status: 'error',
          latencyMs: result.elapsedMs,
          message: `${options.name} returned ${result.httpStatus}`,
        }
      : {
          status: 'error',
          latencyMs: result.elapsedMs,
          message: `${options.name} health check failed`,
          details: { error: result.message },
        };
  }

  const body = result.body;
  const status = options.statusFromBody(body ?? {});
  if (status !== options.healthyStatus) {
    return {
      status: 'error',
      latencyMs: result.elapsedMs,
      message: `${options.name} health check returned status "${status ?? 'unknown'}"`,
    };
  }
  return {
    status: 'ok',
    latencyMs: result.elapsedMs,
    ...(options.details ? { details: options.details(body ?? {}) } : {}),
  };
}
