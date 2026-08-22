import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MAINTENANCE_TASKS,
  type MaintenanceTask,
} from '@common/domain/maintenance-task.interface';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { METRICS } from '@common/domain/metrics-catalog';
import { PostgresAdvisoryLock } from '@/prisma/postgres-advisory-lock';
import { AppLoggerService } from '@common/logging/app-logger.service';

export async function withCronJob<T>(
  lock: PostgresAdvisoryLock,
  logger: AppLoggerService,
  lockId: number,
  label: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const didAcquire = await lock.tryLock(lockId);

  if (!didAcquire) {
    logger.log(`${label} skipped — lock held by another instance`);
    return undefined;
  }

  logger.log(`Starting ${label}...`);

  try {
    const result = await fn();
    logger.log(`${label} completed successfully.`);
    return result;
  } catch (err) {
    logger.error(
      `${label} failed`,
      err instanceof Error ? err.stack : String(err),
    );
    throw err;
  } finally {
    try {
      await lock.unlock(lockId);
    } catch (err) {
      // A leaked session lock would silently skip every future run; surface
      // the failure without masking the task result.
      logger.error(
        `${label} failed to release lock`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

@Injectable()
export class MaintenanceCron {
  constructor(
    @Inject(MAINTENANCE_TASKS) private readonly tasks: MaintenanceTask[],
    private readonly lock: PostgresAdvisoryLock,
    @Inject(METRICS_RECORDER) private readonly metrics: IMetricsRecorder,
    private readonly logger: AppLoggerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runMaintenance(): Promise<void> {
    for (const task of this.tasks) {
      let result;
      try {
        result = await withCronJob(
          this.lock,
          this.logger,
          task.lockId,
          task.label,
          () => task.execute(),
        );
      } catch (err) {
        this.metrics.incrementCounter(METRICS.maintenanceTaskFailuresTotal, {
          task: task.label,
        });
        this.logger.error(
          `Maintenance task "${task.label}" failed`,
          err instanceof Error ? err.stack : String(err),
        );
        continue;
      }

      if (!result) continue;

      if (result.counters) {
        for (const c of result.counters) {
          this.metrics.incrementCounter(c.name, c.labels, c.value);
        }
      }
      if (result.gauges) {
        for (const g of result.gauges) {
          this.metrics.setGauge(g.name, g.value);
        }
      }
    }
  }
}
