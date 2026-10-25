import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { PrismaModule } from '@prisma/prisma.module';
import { StorageModule } from '@internal/storage/storage.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { JobQueueModule } from '@internal/job-queue/job-queue.module';
import { PdfSidecarModule } from '@internal/pdf-sidecar/pdf-sidecar.module';
import {
  MAINTENANCE_TASKS,
  type MaintenanceTask,
} from '@common/domain/maintenance-task.interface';
import { MaintenanceCron } from '@internal/data-deletion/cron/maintenance.cron';
import { FailedJobCleanupTask } from '@internal/data-deletion/tasks/failed-job-cleanup.task';
import { PdfRenderCacheCleanupTask } from '@internal/data-deletion/tasks/pdf-render-cache-cleanup.task';
import { UnreferencedObjectCleanupTask } from '@internal/data-deletion/tasks/unreferenced-object-cleanup.task';
import { RateLimitBucketCleanupTask } from '@internal/data-deletion/tasks/rate-limit-bucket-cleanup.task';
import { SessionCleanupTask } from '@internal/data-deletion/tasks/session-cleanup.task';
import { RunAutoFinishTask } from '@internal/data-deletion/tasks/run-auto-finish.task';
import { RunHistoryCleanupTask } from '@internal/data-deletion/tasks/run-history-cleanup.task';
import { StorageSizeBackfillTask } from '@internal/data-deletion/tasks/storage-size-backfill.task';
import { ReviewArtifactCleanupTask } from '@internal/data-deletion/tasks/review-artifact-cleanup.task';
import { OrphanCleanupService } from './services/orphan-cleanup.service';
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    StorageModule,
    VisualTestInfraModule,
    JobQueueModule,
    PdfSidecarModule,
  ],
  providers: [
    MaintenanceCron,
    OrphanCleanupService,
    FailedJobCleanupTask,
    PdfRenderCacheCleanupTask,
    UnreferencedObjectCleanupTask,
    RateLimitBucketCleanupTask,
    SessionCleanupTask,
    RunAutoFinishTask,
    RunHistoryCleanupTask,
    StorageSizeBackfillTask,
    ReviewArtifactCleanupTask,
    {
      provide: MAINTENANCE_TASKS,
      useFactory: (
        orphanCleanupService: OrphanCleanupService,
        failedJobCleanupTask: FailedJobCleanupTask,
        pdfRenderCacheCleanupTask: PdfRenderCacheCleanupTask,
        unreferencedObjectCleanupTask: UnreferencedObjectCleanupTask,
        rateLimitBucketCleanupTask: RateLimitBucketCleanupTask,
        sessionCleanupTask: SessionCleanupTask,
        runAutoFinishTask: RunAutoFinishTask,
        runHistoryCleanupTask: RunHistoryCleanupTask,
        storageSizeBackfillTask: StorageSizeBackfillTask,
        reviewArtifactCleanupTask: ReviewArtifactCleanupTask,
      ) =>
        [
          orphanCleanupService,
          failedJobCleanupTask,
          pdfRenderCacheCleanupTask,
          unreferencedObjectCleanupTask,
          rateLimitBucketCleanupTask,
          sessionCleanupTask,
          runAutoFinishTask,
          runHistoryCleanupTask,
          storageSizeBackfillTask,
          reviewArtifactCleanupTask,
        ] as MaintenanceTask[],
      inject: [
        OrphanCleanupService,
        FailedJobCleanupTask,
        PdfRenderCacheCleanupTask,
        UnreferencedObjectCleanupTask,
        RateLimitBucketCleanupTask,
        SessionCleanupTask,
        RunAutoFinishTask,
        RunHistoryCleanupTask,
        StorageSizeBackfillTask,
        ReviewArtifactCleanupTask,
      ],
    },
  ],
  exports: [],
})
export class DataDeletionModule {}
