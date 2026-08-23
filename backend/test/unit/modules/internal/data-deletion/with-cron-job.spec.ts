import { withCronJob } from '@internal/data-deletion/cron/maintenance.cron';
import type { PostgresAdvisoryLock } from '@/prisma/postgres-advisory-lock';
import type { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('withCronJob', () => {
  let lock: jest.Mocked<PostgresAdvisoryLock>;
  let logger: jest.Mocked<AppLoggerService>;

  beforeEach(() => {
    lock = createMock<PostgresAdvisoryLock>();
    lock.tryLock.mockResolvedValue(true);
    lock.unlock.mockResolvedValue();
    logger = createMockLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs the task when the lock is acquired', async () => {
    const fn = jest.fn().mockResolvedValue('done');

    const result = await withCronJob(lock, logger, 1001, 'task', fn);

    expect(result).toBe('done');
    expect(lock.unlock).toHaveBeenCalledWith(1001);
  });

  it('skips without running when the lock is held elsewhere', async () => {
    lock.tryLock.mockResolvedValue(false);
    const fn = jest.fn();

    const result = await withCronJob(lock, logger, 1001, 'task', fn);

    expect(result).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    expect(lock.unlock).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'task skipped — lock held by another instance',
    );
  });

  it('propagates lock-acquisition errors (DB down, not contention)', async () => {
    lock.tryLock.mockRejectedValue(new Error('db down'));
    const fn = jest.fn();

    await expect(withCronJob(lock, logger, 1001, 'task', fn)).rejects.toThrow(
      'db down',
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('logs a leaked lock when unlock fails, without masking the result', async () => {
    lock.unlock.mockRejectedValue(new Error('pool dead'));
    const fn = jest.fn().mockResolvedValue('done');

    const result = await withCronJob(lock, logger, 1001, 'task', fn);

    expect(result).toBe('done');
    expect(logger.error).toHaveBeenCalledWith(
      'task failed to release lock',
      expect.stringContaining('pool dead'),
    );
  });
});
