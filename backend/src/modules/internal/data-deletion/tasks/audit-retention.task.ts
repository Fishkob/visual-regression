import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppConfigService } from '@config/app-config.service';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceResult,
  MaintenanceTask,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';

const DAY_MS = 24 * 60 * 60 * 1000;
// The first run after an upgrade deletes the whole backlog, against a table that
// has never seen a DELETE. Doing that in one statement would hold a long lock and
// leave an autovacuum storm behind, so the sweep deletes in batches that each
// commit on their own. The per-run ceiling keeps one backlog sweep from
// monopolizing the shared cron: the remaining rows are the next night's work.
const BATCH_SIZE = 10_000;
const MAX_BATCHES_PER_RUN = 100;

// The audit trail is append-only by design, but not by default forever: it grows
// with every review and every share-link open (that row carries the IP and the
// user agent), and a deployment that must retain less has no way to say so. The
// window belongs to the deployment — 0 keeps the trail forever, which is what an
// operator with a compliance duty sets.
//
// The window should never be shorter than the backup window, because the trail's
// job is to say what was deleted and when so a restore can be scoped to the right
// point; a 30-day trail over 30-day backups leaves nothing to scope from.
@Injectable()
export class AuditRetentionTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.auditRetention;
  readonly label = 'audit retention cleanup';
  private readonly retentionDays: number;

  constructor(
    private readonly connection: PrismaConnection,
    appConfig: AppConfigService,
  ) {
    this.retentionDays = appConfig.auditRetention.days;
  }

  async execute(): Promise<MaintenanceResult> {
    if (this.retentionDays === 0) {
      return {};
    }

    const cutoff = new Date(Date.now() - this.retentionDays * DAY_MS);
    let deleted = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const rows = await this.connection.client.auditEvent.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;

      const result = await this.connection.client.auditEvent.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      deleted += result.count;

      if (rows.length < BATCH_SIZE) break;
    }

    return {
      gauges: [
        { name: METRICS.cleanupAuditEventsDeleted, value: deleted },
        { name: METRICS.cleanupAuditEventsLastRun, value: Date.now() },
      ],
    };
  }
}
