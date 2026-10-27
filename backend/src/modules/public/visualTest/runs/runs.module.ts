import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AppConfigModule } from '@config/app-config.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { ReviewModule } from '@public/visualTest/review/review.module';
import { RunsController } from '@public/visualTest/runs/presentation/controllers/runs.controller';
import { TrendsController } from '@public/visualTest/runs/presentation/controllers/trends.controller';
import { RunService } from '@public/visualTest/runs/application/run.service';
import { TrendsService } from '@public/visualTest/runs/application/trends.service';

// A Run groups a CI run's uploads and gates it. It reads review state (its
// approve-all is the shared batch) but owns the run's own lifecycle and
// reporting.
@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
    VisualTestInfraModule,
    VisualTestApplicationModule,
    ReviewModule,
  ],
  controllers: [RunsController, TrendsController],
  providers: [RunService, TrendsService],
})
export class RunsModule {}
