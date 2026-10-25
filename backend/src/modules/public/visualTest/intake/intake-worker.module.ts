import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { PrismaModule } from '@prisma/prisma.module';
import { StorageModule } from '@internal/storage/storage.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { ComparisonEngineModule } from '@internal/comparison-engine/comparison-engine.module';
import { JobQueueModule } from '@internal/job-queue/job-queue.module';
import { WebhooksModule } from '@internal/webhooks/webhooks.module';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import { ComparisonJobPoller } from '@public/visualTest/intake/workers/comparison-job-poller';
import { WorkerHealthServer } from '@internal/worker/worker-health-server';
import { WORKER_HEALTH } from '@common/domain/worker-health.interface';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    StorageModule,
    VisualTestInfraModule,
    VisualTestApplicationModule,
    ComparisonEngineModule,
    JobQueueModule,
    WebhooksModule,
  ],
  providers: [
    ComparisonJobProcessor,
    ComparisonJobPoller,
    WorkerHealthServer,
    { provide: WORKER_HEALTH, useExisting: WorkerHealthServer },
  ],
})
export class IntakeWorkerModule {}
