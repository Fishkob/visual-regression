import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceResult,
  MaintenanceTask,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';

// Finished runs are history, not live work: deleting them preserves the
// denormalized runId/runKey on comparisons/approvals (no FK), so reports stay
// readable while the run list stops growing forever. Per-project days win over
// the global default.
@Injectable()
export class RunHistoryCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.runHistoryCleanup;
  readonly label = 'run history cleanup';

  constructor(
    private readonly runs: RunRepository,
    private readonly config: AppConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(): Promise<MaintenanceResult> {
    const projects = await this.runs.listRetentionProjects();
    let deleted = 0;
    for (const project of projects) {
      const days =
        project.runHistoryDays ?? this.config.retention.runHistoryDays;
      if (days <= 0) continue;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      deleted += await this.runs.deleteFinishedBefore(project.id, cutoff);
    }
    if (deleted > 0) {
      this.logger.log(`Deleted ${String(deleted)} run(s) past retention`);
    }
    return {
      counters: [{ name: METRICS.cleanupRunsRetained, value: deleted }],
    };
  }
}
