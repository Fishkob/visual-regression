import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottleConfigModule } from '@config/throttle-config.module';
import { CoreInfrastructureModule } from '@/core-infrastructure.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { IntakeApplicationModule } from '@public/visualTest/intake/intake-application.module';
import { ReviewModule } from '@public/visualTest/review/review.module';

import { HealthModule } from '@internal/health/health.module';
import { LogIngestionModule } from '@internal/logging/log-ingestion.module';
import { DataDeletionModule } from '@internal/data-deletion/data-deletion.module';
import { DlqModule } from '@internal/dlq/dlq.module';
import { AllExceptionsFilter } from '@common/http/all-exceptions.filter';
import { LoggingInterceptor } from '@common/http/logging.interceptor';
import { HttpMetricsInterceptor } from '@common/http/http-metrics.interceptor';

@Module({
  imports: [
    CoreInfrastructureModule,
    ThrottleConfigModule,

    ScheduleModule.forRoot(),
    VisualTestApplicationModule,
    IntakeApplicationModule,
    ReviewModule,
    HealthModule,
    LogIngestionModule,
    DlqModule,
    DataDeletionModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule {}
