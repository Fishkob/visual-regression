import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceResult,
  MaintenanceTask,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';

const BATCH_PER_PROJECT = 100;

// Objects written before size tracking have sizeBytes = 0, so usage/quota
// undercounts them. This task downloads every legacy object once, records its
// byte length and leaves sizeBytes > 0 as the "done" marker.
@Injectable()
export class StorageSizeBackfillTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.storageSizeBackfill;
  readonly label = 'storage size backfill';

  constructor(
    private readonly projects: ProjectRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(): Promise<MaintenanceResult> {
    const projects = await this.projects.findAll();
    let updated = 0;
    for (const project of projects.data) {
      const missingScreenshots = await this.screenshots.findMissingSizes(
        project.name,
        BATCH_PER_PROJECT,
      );
      for (const row of missingScreenshots) {
        try {
          const bytes = await this.storage.get(row.imageUrl);
          await this.screenshots.setSizeBytes(row.id, bytes.length);
          updated += 1;
        } catch {
          // Missing object: leave the zero marker so the next run retries or a
          // cleanup removes the row.
        }
      }

      const missingDiffs = await this.comparisons.findMissingDiffSizes(
        project.name,
        BATCH_PER_PROJECT,
      );
      for (const row of missingDiffs) {
        const url = row.diffImageUrl ?? row.diffPdfUrl;
        if (!url) continue;
        try {
          const bytes = await this.storage.get(url);
          await this.comparisons.setDiffSizeBytes(row.id, bytes.length);
          updated += 1;
        } catch {
          // See above.
        }
      }
    }
    if (updated > 0) {
      this.logger.log(`Backfilled ${String(updated)} storage size(s)`);
    }
    return {
      counters: [{ name: METRICS.storageSizeBackfilled, value: updated }],
    };
  }
}
