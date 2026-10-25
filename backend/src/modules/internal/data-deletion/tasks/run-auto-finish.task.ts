import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceResult,
  MaintenanceTask,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';

const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// A pipeline that crashes after uploading but before calling finish would
// otherwise leave its run open forever. Uploads refresh lastActivityAt, so a
// run idle for a day is abandoned; finishing it (with finishedBy = 'auto')
// makes the distinction visible in the run read.
@Injectable()
export class RunAutoFinishTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.runAutoFinish;
  readonly label = 'run auto-finish';

  constructor(
    private readonly runs: RunRepository,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(): Promise<MaintenanceResult> {
    const cutoff = new Date(Date.now() - IDLE_TIMEOUT_MS);
    const finished = await this.runs.finishIdleBefore(cutoff);
    if (finished > 0) {
      this.logger.log(`Auto-finished ${finished} idle run(s)`);
    }
    return {
      counters: [{ name: METRICS.cleanupRunsAutoFinished, value: finished }],
    };
  }
}
