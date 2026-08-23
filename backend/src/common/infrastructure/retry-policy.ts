import { Prisma } from '@/prisma/client';
import { DomainError, type DomainErrorCode } from '@common/domain/domain-error';

export const JOB_MAX_ATTEMPTS = 3;

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
    nextAttemptAt: new Date(Date.now() + exponentialBackoffMs(newAttempts - 1)),
  };
}

export function exponentialBackoffMs(attempt: number, baseMs = 1000): number {
  return Math.pow(2, attempt) * baseMs;
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

export function isSerializationError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034'
  );
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
