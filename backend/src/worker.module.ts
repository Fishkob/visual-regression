import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreInfrastructureModule } from '@/core-infrastructure.module';
import { IntakeWorkerModule } from '@public/visualTest/intake/intake-worker.module';
import { DataDeletionModule } from '@internal/data-deletion/data-deletion.module';

// Retention runs in the worker, not the API: the sweeps list whole storage
// namespaces and delete across large tables, which has no business competing
// with request handling for the event loop and the connection pool. Every
// shipped topology runs a worker (docker-compose and the Helm chart both do), so
// this is the process that is always alive and can own the schedule. The
// per-task advisory locks make it safe even if a second worker runs alongside.
@Module({
  imports: [
    CoreInfrastructureModule,
    IntakeWorkerModule,
    ScheduleModule.forRoot(),
    DataDeletionModule,
  ],
})
export class WorkerModule {}
