import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  Reflector,
} from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreInfrastructureModule } from '@/core-infrastructure.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { IntakeApplicationModule } from '@public/visualTest/intake/intake-application.module';
import { ReviewModule } from '@public/visualTest/review/review.module';
import { CatalogModule } from '@public/visualTest/catalog/catalog.module';
import { RunsModule } from '@public/visualTest/runs/runs.module';
import { AccessModule } from '@public/visualTest/access/access.module';
import { NotificationsModule } from '@public/visualTest/notifications/notifications.module';

import { HealthModule } from '@internal/health/health.module';
import { LogIngestionModule } from '@internal/logging/log-ingestion.module';
import { DataDeletionModule } from '@internal/data-deletion/data-deletion.module';
import { DlqModule } from '@internal/dlq/dlq.module';
import { AuthModule } from '@internal/auth/auth.module';
import { AdminApiKeysModule } from '@internal/admin/admin-api-keys.module';
import { ApiKeysModule } from '@internal/api-keys/api-keys.module';
import { AuthenticationGuard } from '@internal/auth/authentication.guard';
import { RateLimitModule } from '@internal/rate-limit/rate-limit.module';
import { AuditModule } from '@internal/audit/audit.module';
import { UsersModule } from '@internal/users/users.module';
import { RateLimitGuard } from '@internal/rate-limit/rate-limit.guard';
import { AllExceptionsFilter } from '@common/http/all-exceptions.filter';
import { LoggingInterceptor } from '@common/http/logging.interceptor';
import { HttpMetricsInterceptor } from '@common/http/http-metrics.interceptor';

@Module({
  imports: [
    CoreInfrastructureModule,
    ScheduleModule.forRoot(),
    VisualTestApplicationModule,
    IntakeApplicationModule,
    CatalogModule,
    ReviewModule,
    RunsModule,
    AccessModule,
    NotificationsModule,
    HealthModule,
    LogIngestionModule,
    DlqModule,
    DataDeletionModule,
    AuthModule,
    AdminApiKeysModule,
    ApiKeysModule,
    RateLimitModule,
    AuditModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      // Response serialization is a global guard rather than an opt-in call
      // site: every DTO instance returned has its fields filtered to those
      // marked @Expose, so a new entity shape cannot leak because a controller
      // forgot a plainToInstance({ excludeExtraneousValues: true }). Plain
      // objects pass through untouched (class-transformer only filters class
      // instances), so wrappers like { data, meta } and inline literals are
      // unaffected.
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector) =>
        new ClassSerializerInterceptor(reflector, {
          excludeExtraneousValues: true,
        }),
      inject: [Reflector],
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
