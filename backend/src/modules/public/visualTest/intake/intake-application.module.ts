import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfigModule } from '@config/app-config.module';
import { AppConfigService } from '@config/app-config.service';
import { PrismaModule } from '@prisma/prisma.module';
import { StorageModule } from '@internal/storage/storage.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { JobQueueModule } from '@internal/job-queue/job-queue.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { UploadIntake } from '@public/visualTest/intake/application/upload-intake.service';
import { UploadDecisionResolver } from '@public/visualTest/intake/application/upload-decision.resolver';
import { PdfSidecarModule } from '@internal/pdf-sidecar/pdf-sidecar.module';
import { UploadController } from '@public/visualTest/intake/presentation/controllers/upload.controller';
import { JobStatusController } from '@public/visualTest/intake/presentation/controllers/job-status.controller';
import { JobStatusService } from '@public/visualTest/intake/application/job-status.service';
import { ComparisonJobStatusRepository } from '@public/visualTest/intake/infrastructure/repositories/comparison-job-status.repository';
import {
  DEFAULT_JOB_STATUS_POLLING,
  JOB_STATUS_POLLING,
} from '@public/visualTest/intake/application/job-status-polling';

@Module({
  imports: [
    AppConfigModule,
    MulterModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => ({
        // multer's defaults are `fields/files/parts = Infinity`, and every text
        // part is buffered in memory for the whole request. Uploads run in the
        // API process with memory storage, so an authenticated caller could
        // otherwise push an arbitrary number of 1 MB fields into the heap. One
        // file and the DTO's handful of text fields are all the route accepts.
        limits: {
          fileSize: appConfig.screenshotMaxSize,
          files: 1,
          fields: 20,
          parts: 25,
          fieldSize: 8 * 1024,
        },
      }),
    }),
    PrismaModule,
    StorageModule,
    VisualTestInfraModule,
    JobQueueModule,
    VisualTestApplicationModule,
    PdfSidecarModule,
  ],
  controllers: [UploadController, JobStatusController],
  providers: [
    UploadIntake,
    UploadDecisionResolver,
    JobStatusService,
    ComparisonJobStatusRepository,
    { provide: JOB_STATUS_POLLING, useValue: DEFAULT_JOB_STATUS_POLLING },
  ],
})
export class IntakeApplicationModule {}
