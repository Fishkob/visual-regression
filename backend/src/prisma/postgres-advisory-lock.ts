import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { Pool } from 'pg';

@Injectable()
export class PostgresAdvisoryLock implements OnModuleDestroy {
  readonly pool: Pool;

  // pg_try_advisory_lock is session-level and re-entrant: a second acquire for
  // the same key on the same session returns true (and bumps the lock count).
  // Because this pool is max:1, every caller shares one session, so without
  // this guard two maintenance runs in the same process would both "acquire"
  // the lock. The Set mirrors the session's held keys so in-process mutual
  // exclusion holds; cross-process exclusion still comes from Postgres.
  private readonly heldInProcess = new Set<number>();

  constructor(appConfig: AppConfigService) {
    this.pool = new Pool({
      connectionString: appConfig.database.url,
      max: 1,
    });
    // Session-scoped locks vanish when the pooled connection is recycled
    // (idle timeout / reset / server restart), but the mirror would keep
    // believing it holds them — tryLock would return false forever and the
    // maintenance task silently never runs again. A fresh session holds none of
    // the old session's locks, so clearing the mirror whenever the connection
    // changes keeps the two from drifting. The 'error' listener also prevents a
    // dead idle client from crashing the process with an unhandled event.
    this.pool.on('connect', () => this.heldInProcess.clear());
    this.pool.on('error', () => this.heldInProcess.clear());
  }

  async tryLock(lockId: number): Promise<boolean> {
    if (this.heldInProcess.has(lockId)) {
      return false;
    }
    const result = await this.pool.query<{ pg_try_advisory_lock: boolean }>(
      'SELECT pg_try_advisory_lock($1)',
      [lockId],
    );
    const acquired = result.rows[0]?.pg_try_advisory_lock ?? false;
    if (acquired) {
      this.heldInProcess.add(lockId);
    }
    return acquired;
  }

  async unlock(lockId: number): Promise<void> {
    // unlock_all is idempotent and clears any re-entrant count a previously
    // failed unlock leaked on this session (the pool is max:1, so at most one
    // advisory lock is held here at a time). The Set is cleared only after the
    // release succeeds — a thrown unlock leaves the mirror holding the key, and
    // the pool's connect/error events reconcile it instead of wedging.
    await this.pool.query('SELECT pg_advisory_unlock_all()');
    this.heldInProcess.delete(lockId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
