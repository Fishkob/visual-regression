import { Module } from '@nestjs/common';
import { CoreInfrastructureModule } from '@/core-infrastructure.module';
import { IntakeWorkerModule } from '@public/visualTest/intake/intake-worker.module';

@Module({
  imports: [CoreInfrastructureModule, IntakeWorkerModule],
})
export class WorkerModule {}
