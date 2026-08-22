import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthChecker } from './health-checker.service';
import { AppConfigModule } from '@config/app-config.module';
import { JobQueueModule } from '@internal/job-queue/job-queue.module';
import { StorageModule } from '@internal/storage/storage.module';
import { PrismaModule } from '@prisma/prisma.module';

@Module({
  imports: [PrismaModule, JobQueueModule, StorageModule, AppConfigModule],
  controllers: [HealthController],
  providers: [HealthChecker],
})
export class HealthModule {}
