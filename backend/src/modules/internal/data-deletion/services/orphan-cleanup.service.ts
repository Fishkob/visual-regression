import { Inject, Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { AppLoggerService } from '@common/logging/app-logger.service';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  STORAGE_OBJECT_REFERENCEDNESS,
  IStorageObjectReferencedness,
} from '@common/domain/storage-referencedness.interface';
import {
  ORPHAN_SWEEP,
  IOrphanSweep,
  DEFAULT_ORPHAN_GRACE_HOURS,
} from '@common/domain/orphan-sweep.interface';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { METRICS } from '@common/domain/metrics-catalog';
import {
  buildDeletionRecords,
  deleteRecordsRowFirst,
} from '@internal/data-deletion/services/deletion-records';
import { isString } from '@common/utils/is-string';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';

@Injectable()
export class OrphanCleanupService implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.orphanCleanup;
  readonly label = 'orphaned cleanup';

  constructor(
    @Inject(ORPHAN_SWEEP) private readonly orphanSweep: IOrphanSweep,
    @Inject(STORAGE_OBJECT_REFERENCEDNESS)
    private readonly referencedness: IStorageObjectReferencedness,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly uow: PrismaUnitOfWork,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(): Promise<MaintenanceResult> {
    const result = await this.deleteOrphanedScreenshots();
    return {
      counters: [
        {
          name: METRICS.cleanupOrphanedScreenshotsTotal,
          value: result.deleted,
        },
      ],
      gauges: [
        {
          name: METRICS.cleanupOrphanedScreenshotsLastRun,
          value: Date.now(),
        },
      ],
    };
  }

  async deleteOrphanedScreenshots(): Promise<{ deleted: number }> {
    const [currentScan, baselineOrphans] = await Promise.all([
      this.orphanSweep.findOrphanedCurrent(),
      // The project's own grace applies per row; this is only the fallback for
      // a project without an override (see ADR-042/`orphanGraceHours`).
      this.orphanSweep.findOrphanedBaseline({
        defaultGraceHours: DEFAULT_ORPHAN_GRACE_HOURS,
      }),
    ]);

    if (currentScan.skipped) {
      this.logger.warn(
        'Current-orphan sweep skipped: an active comparison job has NULL candidateId (legacy pre-backfill row) — cannot prove which candidate is in flight',
      );
    }

    const deleted =
      (await this.cleanupOrphans(currentScan.screenshots, 'current')) +
      (await this.cleanupOrphans(baselineOrphans, 'baseline'));

    return { deleted };
  }

  private async cleanupOrphans(
    screenshots: { id: string; imageUrl: string }[],
    type: string,
  ): Promise<number> {
    if (screenshots.length === 0) return 0;
    if (type === 'baseline') {
      return this.cleanupBaselineOrphans(screenshots);
    }
    return this.cleanupCurrentOrphans(screenshots);
  }

  // CURRENT orphans stay storage-first: the deleted object is the stale
  // replaced file, and a concurrent upload that re-upserts the candidate row in
  // place is protected by the guarded DELETE. The row whose storage delete
  // failed is retained so the next run retries it. This is the only
  // storage-first maintenance deletion, so the ordering lives inline rather
  // than as a shared helper.
  private async cleanupCurrentOrphans(
    screenshots: { id: string; imageUrl: string }[],
  ): Promise<number> {
    const records = await buildDeletionRecords(
      screenshots.map((s) => ({ id: s.id, url: s.imageUrl })),
      true,
      (urls) => this.referencedness.filterReclaimableUrls(urls),
    );

    const urls = records.map((record) => record.url).filter(isString);
    const failedUrls = new Set<string>();
    if (urls.length > 0) {
      const result = await this.storage.deleteAll(urls);
      for (const failure of result.failed) failedUrls.add(failure.url);
    }

    const idsToDelete = records
      .filter((record) => !record.url || !failedUrls.has(record.url))
      .map((record) => record.id);

    let deletedRows = 0;
    if (idsToDelete.length > 0) {
      deletedRows = await this.deleteOrphanRows(idsToDelete);
    }

    if (failedUrls.size > 0) {
      this.logger.warn(
        `Storage deletion failures (orphaned current screenshots), DB records retained for retry: ${[...failedUrls].join(', ')}`,
      );
    } else {
      this.logger.log(
        `Deleted ${deletedRows} DB records + storage files (orphaned current screenshots)`,
      );
    }

    return deletedRows;
  }

  // BASELINE orphans must never be storage-first: the object is the baseline's
  // live content, and a comparison that re-adopts this baseline between the
  // file delete and the guarded row delete would survive with its object gone.
  // Row-first: the guarded DELETE returns the URLs of exactly the rows removed
  // (guards live in the same statement, so a concurrent re-adoption refuses the
  // row and keeps its file), and those files are reclaimed after, funnelled
  // through the "safe to reclaim" owner. A file that still fails to delete
  // leaks to the unreferenced-object sweep.
  private async cleanupBaselineOrphans(
    screenshots: { id: string; imageUrl: string }[],
  ): Promise<number> {
    const idByUrl = new Map(
      screenshots.map((s) => [s.imageUrl, s.id] as const),
    );
    const { deletedRows, failedUrls } = await this.uow.execute(() =>
      deleteRecordsRowFirst({
        records: screenshots.map((s) => ({ id: s.id, url: s.imageUrl })),
        deleteRows: async (ids) => {
          const deletedUrls =
            await this.orphanSweep.deleteBaselineOrphansByIdsReturningUrls(
              ids,
              { defaultGraceHours: DEFAULT_ORPHAN_GRACE_HOURS },
            );
          return deletedUrls.map((url) => idByUrl.get(url)).filter(isString);
        },
        storage: this.storage,
        reclaimUrls: (urls) => this.referencedness.filterReclaimableUrls(urls),
      }),
    );

    if (failedUrls.length > 0) {
      this.logger.warn(
        `Storage deletion failures (orphaned baseline screenshots), unreferenced sweep will reclaim: ${failedUrls.join(', ')}`,
      );
    } else {
      this.logger.log(
        `Deleted ${deletedRows} DB records + storage files (orphaned baseline screenshots)`,
      );
    }
    return deletedRows;
  }

  // Row deletion is guarded by the orphan predicate re-checked at delete time:
  // a concurrent upload re-upserts the candidate row in place (same id), so the
  // sweep must never delete a row that a fresh upload/comparison/job has since
  // claimed — only its stale storage file (deleted first) is gone for good.
  private deleteOrphanRows(ids: string[]): Promise<number> {
    return this.uow.execute(() =>
      this.orphanSweep.deleteCurrentOrphansByIds(ids),
    );
  }
}
