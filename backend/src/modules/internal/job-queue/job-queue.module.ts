import { Module } from '@nestjs/common';
import { TrackerModule } from '@common/tracker/tracker.module';
import { PrismaModule } from '@prisma/prisma.module';
import {
  JOB_PRODUCER,
  JOB_QUEUE,
  FAILED_JOB_STORE,
} from '@common/domain/job-queue.interface';
import { WebhooksModule } from '@internal/webhooks/webhooks.module';
import { PostgresJobQueue } from './postgres-job-queue';
import { FailedJobStore } from './failed-job.store';
@Module({
  // WebhooksModule supplies JOB_FAILURE_OBSERVERS: the queue injects the token
  // from common/domain and never the adapter, so one module import wires the
  // notification side without a code dependency (ADR-076).
  imports: [PrismaModule, TrackerModule, WebhooksModule],
  providers: [
    PostgresJobQueue,
    FailedJobStore,
    { provide: JOB_PRODUCER, useExisting: PostgresJobQueue },
    { provide: JOB_QUEUE, useExisting: PostgresJobQueue },
    { provide: FAILED_JOB_STORE, useExisting: FailedJobStore },
  ],
  // Only the tokens cross the seam — the concrete PostgresJobQueue /
  // FailedJobStore classes stay private so a consumer cannot inject them and
  // reach past the producer/queue/store faces.
  exports: [FAILED_JOB_STORE, JOB_PRODUCER, JOB_QUEUE],
})
export class JobQueueModule {}
