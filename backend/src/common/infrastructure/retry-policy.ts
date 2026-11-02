import { Prisma } from '@/prisma/client';
import { DomainError, type DomainErrorCode } from '@common/domain/domain-error';

// A comparison job's retry budget is minutes, not seconds: the failures it must
// survive are infrastructure blips (a Postgres restart, a storage or sidecar
// outage), and a budget that expires before the outage does turns every
// in-flight job into a DLQ row. Five attempts at 30 s, 60 s, 120 s and 240 s
// give the stack roughly 7.5 minutes to come back before the job is failed.
export const JOB_MAX_ATTEMPTS = 5;
export const JOB_RETRY_BASE_DELAY_MS = 30_000;
export const JOB_RETRY_MAX_DELAY_MS = 5 * 60_000;

export interface RetryDecision {
  action: 'retry' | 'failed';
  nextAttemptAt?: Date;
}

export function decideRetry(
  attempts: number,
  maxAttempts: number | null,
): RetryDecision {
  const max = maxAttempts ?? JOB_MAX_ATTEMPTS;
  const newAttempts = attempts + 1;

  if (newAttempts >= max) {
    return { action: 'failed' };
  }

  return {
    action: 'retry',
    // newAttempts is 1 on the first failure — delay by the base (2^0 × base),
    // not 2× the base, so the configured delay matches the doc.
    nextAttemptAt: new Date(
      Date.now() +
        exponentialBackoffMs(
          newAttempts - 1,
          JOB_RETRY_BASE_DELAY_MS,
          JOB_RETRY_MAX_DELAY_MS,
        ),
    ),
  };
}

export function exponentialBackoffMs(
  attempt: number,
  baseMs = 1000,
  maxMs = Number.POSITIVE_INFINITY,
): number {
  return Math.min(Math.pow(2, attempt) * baseMs, maxMs);
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: (attempt: number) => number;
  isRetryable: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number) => void;
}

export async function retry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
): Promise<T> {
  if (policy.maxAttempts < 1) {
    throw new Error(
      `maxAttempts must be at least 1 (got ${policy.maxAttempts})`,
    );
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= policy.maxAttempts || !policy.isRetryable(err)) {
        throw err;
      }
      policy.onRetry?.(err, attempt);
      await delay(policy.backoffMs(attempt));
    }
  }
  throw lastError;
}

// Prisma reports a serialization failure of a *raw* statement (`$queryRaw`,
// `$executeRaw`) as P2010 with the SQLSTATE in `meta.code` instead of P2034. It
// is the same conflict, so it has to be retryable — otherwise the first
// statement of a transaction can turn a retryable 40001 into a 500.
const RAW_SERIALIZATION_FAILURE = 'P2010';
const SQLSTATE_SERIALIZATION_FAILURE = '40001';

export function isSerializationError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === 'P2034') return true;
  if (err.code !== RAW_SERIALIZATION_FAILURE) return false;
  const code = (err.meta as { code?: unknown } | undefined)?.code;
  return code === SQLSTATE_SERIALIZATION_FAILURE;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003'
  );
}

// DomainError codes that are permanent failures — never worth a retry.
// SIDECAR_ERROR is deliberately absent: sidecar outages are transient.
const NON_RETRYABLE_CODES: ReadonlySet<DomainErrorCode> = new Set([
  'BAD_REQUEST',
  'CONFLICT',
  'E_UNIQUE_CONSTRAINT',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_STATE',
  // A full quota is a verdict, not a hiccup: retrying a diff that cannot be
  // stored just burns the backoff budget before the job fails anyway (ADR-043).
  'QUOTA_EXCEEDED',
]);

export function isRetryableError(err: unknown): boolean {
  if (err instanceof DomainError) {
    return !(err.code && NON_RETRYABLE_CODES.has(err.code));
  }
  return true;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
