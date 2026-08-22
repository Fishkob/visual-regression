import { PostgresAdvisoryLock } from '@/prisma/postgres-advisory-lock';
import type { AppConfigService } from '@config/app-config.service';

describe('PostgresAdvisoryLock', () => {
  let lock: PostgresAdvisoryLock;
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn();
    const appConfig = {
      database: { url: 'postgres://test:test@localhost:5432/test' },
    } as unknown as AppConfigService;
    lock = new PostgresAdvisoryLock(appConfig);
    jest.spyOn(lock.pool, 'query').mockImplementation(query as never);
    jest.spyOn(lock.pool, 'end').mockImplementation(jest.fn() as never);
  });

  it('acquires the lock', async () => {
    query.mockResolvedValue({ rows: [{ pg_try_advisory_lock: true }] });
    expect(await lock.tryLock(1001)).toBe(true);
    expect(query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock($1)',
      [1001],
    );
  });

  it('returns false when the lock is held elsewhere', async () => {
    query.mockResolvedValue({ rows: [{ pg_try_advisory_lock: false }] });
    expect(await lock.tryLock(1001)).toBe(false);
  });

  it('releases all session advisory locks on unlock (idempotent, clears leaked counts)', async () => {
    await lock.unlock(1001);
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_unlock_all()');
  });

  it('rethrows pool errors instead of reporting not-acquired', async () => {
    query.mockRejectedValue(new Error('db down'));
    await expect(lock.tryLock(1001)).rejects.toThrow('db down');
  });

  it('rethrows unlock failures instead of swallowing them', async () => {
    query.mockRejectedValue(new Error('pool dead'));
    await expect(lock.unlock(1001)).rejects.toThrow('pool dead');
  });

  it('refuses a re-acquire for the same key in-process (session re-entrancy)', async () => {
    query.mockResolvedValue({ rows: [{ pg_try_advisory_lock: true }] });
    expect(await lock.tryLock(1001)).toBe(true);
    expect(await lock.tryLock(1001)).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('allows re-acquiring after an unlock released the in-process guard', async () => {
    query.mockResolvedValue({ rows: [{ pg_try_advisory_lock: true }] });
    expect(await lock.tryLock(1001)).toBe(true);
    await lock.unlock(1001);
    expect(await lock.tryLock(1001)).toBe(true);
  });

  it('clears the mirror when the pooled connection is recycled (connect event)', async () => {
    query.mockResolvedValue({ rows: [{ pg_try_advisory_lock: true }] });
    expect(await lock.tryLock(1001)).toBe(true);
    expect(await lock.tryLock(1001)).toBe(false);

    // A recycled session silently released the lock; the pool fires 'connect'
    // for the new session. The mirror must not keep skipping the task forever.
    lock.pool.emit('connect');
    expect(await lock.tryLock(1001)).toBe(true);
  });

  it('clears the mirror when the pooled connection errors (connection reset)', async () => {
    query.mockResolvedValue({ rows: [{ pg_try_advisory_lock: true }] });
    expect(await lock.tryLock(1001)).toBe(true);
    expect(await lock.tryLock(1001)).toBe(false);

    lock.pool.emit('error', new Error('connection reset'));
    expect(await lock.tryLock(1001)).toBe(true);
  });
});
