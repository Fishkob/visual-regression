export type HealthStatus = 'ok' | 'degraded' | 'error' | 'skipped';

export interface HealthCheckResult {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}
