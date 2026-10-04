import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from '@config/env.validation';
import { LoggerConfigModule } from '@config/logger-config.module';
import { AppConfigModule } from '@config/app-config.module';
import { AppLoggerModule } from '@common/logging/app-logger.module';
import { AppShutdownService } from '@common/logging/app-shutdown.service';
import { TrackerModule } from '@common/tracker/tracker.module';
import { StorageModule } from '@internal/storage/storage.module';
import { PrismaModule } from '@prisma/prisma.module';
import { MetricsBaseModule } from '@internal/metrics/metrics-base.module';

// Composition root: the entry modules (AppModule / WorkerModule / SwaggerAppModule)
// import this single composite to pull in all cross-cutting infrastructure.
// It deliberately lives at the app root rather than in `common/` so the "common
// is a stable dependency base" invariant holds — `common/` never imports
// `internal/` implementations.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        libraryOptions: {
          allowUnknown: true,
          abortEarly: false,
        },
      },
    }),
    LoggerConfigModule,
    AppConfigModule,
    AppLoggerModule,
    TrackerModule,
    StorageModule,
    PrismaModule,
    MetricsBaseModule,
  ],
  providers: [AppShutdownService],
  exports: [AppConfigModule, AppLoggerModule, TrackerModule],
})
export class CoreInfrastructureModule {}
