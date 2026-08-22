import { Module } from '@nestjs/common';
import { JobQueueModule } from '@internal/job-queue/job-queue.module';
import { AppConfigModule } from '@config/app-config.module';
import { DlqController } from './dlq.controller';
import { DlqService } from './dlq.service';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  imports: [JobQueueModule, AppConfigModule],
  controllers: [DlqController],
  providers: [DlqService, AdminAuthGuard],
})
export class DlqModule {}
