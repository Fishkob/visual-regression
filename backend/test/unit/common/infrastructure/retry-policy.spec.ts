import {
  decideRetry,
  isRetryableError,
  isSerializationError,
  retry,
} from '@common/infrastructure/retry-policy';
import { Prisma } from '@/prisma/client';
import { DomainError } from '@common/domain/domain-error';

describe('decideRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns failed when maxAttempts exceeded', () => {
    const result = decideRetry(3, 3);
    expect(result).toEqual({ action: 'failed' });
  });

  it('returns failed when newAttempts reaches maxAttempts exactly', () => {
    const result = decideRetry(2, 3);
    expect(result).toEqual({ action: 'failed' });
  });

  it('returns failed when the next attempt would exceed maxAttempts', () => {
    const result = decideRetry(3, 3);
    expect(result).toEqual({ action: 'failed' });
  });

  it('returns retry when attempts remain below maxAttempts', () => {
    const result = decideRetry(1, 3);
    expect(result.action).toBe('retry');
    expect(result.nextAttemptAt).toBeDefined();
  });

  it('returns retry with exponential backoff when attempts remain', () => {
    const result = decideRetry(0, 3);
    expect(result.action).toBe('retry');
    expect(result.nextAttemptAt).toBeDefined();
    // The first scheduled delay equals the base (2^0 * 1000) so
    // tuning the base sets the actual delay between retries.
    const expectedDelay = Math.pow(2, 0) * 1000;
    expect(result.nextAttemptAt!.getTime()).toBe(
      new Date('2025-01-01T00:00:00Z').getTime() + expectedDelay,
    );
  });

  it('uses exponential backoff based on attempt number', () => {
    const attempt1 = decideRetry(0, 5);
    const attempt2 = decideRetry(1, 5);
    const attempt3 = decideRetry(2, 5);

    const delay1 = attempt1.nextAttemptAt!.getTime() - Date.now();
    const delay2 = attempt2.nextAttemptAt!.getTime() - Date.now();
    const delay3 = attempt3.nextAttemptAt!.getTime() - Date.now();

    expect(delay1).toBe(Math.pow(2, 0) * 1000);
    expect(delay2).toBe(Math.pow(2, 1) * 1000);
    expect(delay3).toBe(Math.pow(2, 2) * 1000);
  });

  it('uses default maxAttempts of 3 when maxAttempts is null', () => {
    const result = decideRetry(3, null);
    expect(result).toEqual({ action: 'failed' });
  });

  it('still retries when null maxAttempts and attempts remain', () => {
    const result = decideRetry(0, null);
    expect(result.action).toBe('retry');
  });

  it('returns retry when attempts is far below max', () => {
    const result = decideRetry(0, 10);
    expect(result.action).toBe('retry');
    expect(result.nextAttemptAt).toBeDefined();
  });
});

describe('retry with storage retry policy', () => {
  const storagePolicy = (maxAttempts: number, retryDelayMs: number) => ({
    maxAttempts,
    backoffMs: (attempt: number) => retryDelayMs * attempt,
    isRetryable: () => true,
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, storagePolicy(3, 10));
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds with linear backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    const result = await retry(fn, storagePolicy(3, 10));
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws when all retries exhausted', async () => {
    const error = new Error('persistent');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retry(fn, storagePolicy(3, 10))).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when maxAttempts is 1', async () => {
    const error = new Error('fail');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retry(fn, storagePolicy(1, 10))).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('waits with linear delay between retries', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    const promise = retry(fn, storagePolicy(3, 100));

    // 1st call immediate, 1st retry after 100ms, 2nd retry after 200ms
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('does not delay on first successful attempt', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue('fast');

    const promise = retry(fn, storagePolicy(3, 10000));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('fast');

    vi.useRealTimers();
  });
});

describe('retry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, {
      maxAttempts: 3,
      backoffMs: () => 0,
      isRetryable: () => true,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    const result = await retry(fn, {
      maxAttempts: 3,
      backoffMs: () => 0,
      isRetryable: () => true,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws when all retries exhausted', async () => {
    const error = new Error('persistent');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      retry(fn, {
        maxAttempts: 3,
        backoffMs: () => 0,
        isRetryable: () => true,
      }),
    ).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const error = new Error('non-retryable');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      retry(fn, {
        maxAttempts: 3,
        backoffMs: () => 0,
        isRetryable: () => false,
      }),
    ).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('applies backoff between attempts', async () => {
    vi.useFakeTimers();
    const backoffMs = vi.fn().mockReturnValue(50);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    const promise = retry(fn, {
      maxAttempts: 3,
      backoffMs,
      isRetryable: () => true,
    });

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(promise).resolves.toBe('ok');

    expect(backoffMs).toHaveBeenCalledTimes(2);
    expect(backoffMs).toHaveBeenNthCalledWith(1, 1);
    expect(backoffMs).toHaveBeenNthCalledWith(2, 2);

    vi.useRealTimers();
  });

  it('throws a clear error instead of undefined when maxAttempts is non-positive', async () => {
    const fn = vi.fn();

    await expect(
      retry(fn, {
        maxAttempts: 0,
        backoffMs: () => 0,
        isRetryable: () => true,
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes onRetry between attempts', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    const promise = retry(fn, {
      maxAttempts: 3,
      backoffMs: () => 0,
      isRetryable: () => true,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe('isSerializationError', () => {
  it('returns true for Prisma P2034 errors', () => {
    const error = new Prisma.PrismaClientKnownRequestError('serialization', {
      code: 'P2034',
      clientVersion: 'test',
    });
    expect(isSerializationError(error)).toBe(true);
  });

  it('returns false for other Prisma error codes', () => {
    const error = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(isSerializationError(error)).toBe(false);
  });

  it('returns false for generic errors', () => {
    expect(isSerializationError(new Error('boom'))).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('returns true for generic errors', () => {
    expect(isRetryableError(new Error('boom'))).toBe(true);
  });

  it('returns false for permanent DomainError codes', () => {
    for (const code of [
      'BAD_REQUEST',
      'CONFLICT',
      'NOT_FOUND',
      'INVALID_STATE',
    ] as const) {
      expect(isRetryableError(new DomainError(`msg: ${code}`, code))).toBe(
        false,
      );
    }
  });

  it('returns false for FORBIDDEN and E_UNIQUE_CONSTRAINT DomainError codes', () => {
    for (const code of ['FORBIDDEN', 'E_UNIQUE_CONSTRAINT'] as const) {
      expect(isRetryableError(new DomainError(`msg: ${code}`, code))).toBe(
        false,
      );
    }
  });

  it('returns true for transient DomainError codes', () => {
    expect(
      isRetryableError(new DomainError('sidecar down', 'SIDECAR_ERROR')),
    ).toBe(true);
  });
});
