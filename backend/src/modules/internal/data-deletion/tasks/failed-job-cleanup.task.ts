import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import {
  FAILED_JOB_STORE,
  IFailedJobStore,
} from '@common/domain/job-queue.interface';
import {
  STORAGE_OBJECT_REFERENCEDNESS,
  IStorageObjectReferencedness,
} from '@common/domain/storage-referencedness.interface';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { METRICS } from '@common/domain/metrics-catalog';
import {
  buildDeletionRecords,
  deleteRecordsRowFirst,
} from '@internal/data-deletion/services/deletion-records';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';

@Injectable()
export class FailedJobCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.failedJobCleanup;
  readonly label = 'failed job cleanup';
  private readonly retentionDays: number;

  constructor(
    @Inject(FAILED_JOB_STORE) private readonly failedJobs: IFailedJobStore,
    @Inject(STORAGE_OBJECT_REFERENCEDNESS)
    private readonly referencedness: IStorageObjectReferencedness,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly logger: AppLoggerService,
    appConfig: AppConfigService,
  ) {
    this.retentionDays = appConfig.jobRetention.days;
  }

  async execute(): Promise<MaintenanceResult> {
    const failedJobs = await this.failedJobs.findFailedJobs(this.retentionDays);
    const completedDeleted = await this.failedJobs.deleteCompletedJobs(
      this.retentionDays,
    );

    // The failed job's candidate file is the URL frozen in its payload. The
    // CURRENT row must not be consulted by id: the candidate row is re-upserted
    // in place by newer uploads, so a stale candidateId would resolve to the
    // newest upload's file and delete it. Jobs whose payload could not be
    // decoded carry no frozen URL — their candidate row is left for orphan
    // cleanup, which excludes candidates referenced by active jobs.
    const records = await buildDeletionRecords(
      failedJobs.map((job) => ({
        id: job.id,
        url: job.payload?.candidate?.url,
      })),
      (urls) => this.referencedness.filterReclaimableUrls(urls),
    );

    // Row-first, unlike the sibling maintenance sweeps: a DLQ retry can flip a
    // FAILED row to PENDING between a storage-first file delete and the guarded
    // row delete, leaving a retried job whose candidate file is already gone —
    // the diff then moots silently after the operator got a 204. Deleting the
    // rows first (guarded by FAILED status) means a retry either happens before
    // (row deleted → retry 404s loudly) or rescues a row that still has its
    // file. Files are reclaimed only for the ids the delete actually returned,
    // so a rescued row's file is never touched.
    const { deletedRows, failedUrls } = await deleteRecordsRowFirst({
      records,
      deleteRows: (ids) => this.failedJobs.deleteFailedJobRows(ids),
      storage: this.storage,
    });

    if (failedUrls.length > 0) {
      // A row deleted before its file could be reclaimed leaves an object the
      // daily orphan/unreferenced sweeps reclaim (the CURRENT row still holds
      // the URL until orphan cleanup removes it).
      this.logger.warn(
        `Failed to delete ${failedUrls.length} candidate objects for failed jobs (retained for the next sweep run): ${failedUrls.join(', ')}`,
      );
    }

    // Gauges are always emitted (including zero) so Prometheus overwrites the
    // previous run's value — a run that deletes nothing must not leave a stale
    // non-zero "deleted" reading on the dashboard.
    return {
      gauges: [
        { name: METRICS.cleanupFailedJobsDeleted, value: deletedRows },
        { name: METRICS.cleanupCompletedJobsDeleted, value: completedDeleted },
      ],
    };
  }
}
