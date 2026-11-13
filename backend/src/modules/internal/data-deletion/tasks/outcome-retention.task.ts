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
// Same batching as the audit sweep: the first run after an upgrade faces a
// backlog on a table that has never seen a DELETE, and one statement of that
// size would hold a long lock and leave an autovacuum storm behind. The per-run
// ceiling keeps the shared cron from being monopolized by one backlog.
const BATCH_SIZE = 10_000;
const MAX_BATCHES_PER_RUN = 100;

// `ComparisonOutcomeEvent` is the trend/flake history: one row per completed
// comparison, written after the comparison commits so a lost row can never roll
// back a comparison. It grows with every upload and nothing pruned it, while the
// only reader — the trends endpoint — clamps its window at 365 days. Rows older
// than that are unreachable by every query, so the default window (400 days)
// deletes what nobody can ask for instead of deciding how much history to keep.
// An operator who wants a different trade sets the window; 0 keeps it forever.
@Injectable()
export class OutcomeRetentionTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.outcomeRetention;
  readonly label = 'outcome retention cleanup';
  private readonly retentionDays: number;

  constructor(
    private readonly connection: PrismaConnection,
    appConfig: AppConfigService,
  ) {
    this.retentionDays = appConfig.outcomeRetention.days;
  }

  async execute(): Promise<MaintenanceResult> {
    if (this.retentionDays === 0) {
      return {};
    }

    const cutoff = new Date(Date.now() - this.retentionDays * DAY_MS);
    let deleted = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const rows = await this.connection.client.comparisonOutcomeEvent.findMany(
        {
          where: { createdAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: BATCH_SIZE,
        },
      );
      if (rows.length === 0) break;

      const result =
        await this.connection.client.comparisonOutcomeEvent.deleteMany({
          where: { id: { in: rows.map((row) => row.id) } },
        });
      deleted += result.count;

      if (rows.length < BATCH_SIZE) break;
    }

    return {
      gauges: [
        { name: METRICS.cleanupOutcomesDeleted, value: deleted },
        { name: METRICS.cleanupOutcomesLastRun, value: Date.now() },
      ],
    };
  }
}
