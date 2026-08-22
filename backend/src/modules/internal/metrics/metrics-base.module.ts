import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { AppConfigService } from '@config/app-config.service';
import { METRICS_RECORDER } from '@common/domain/metrics-recorder.interface';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsAuthGuard } from './metrics-auth.guard';
@Global()
@Module({
  imports: [AppConfigModule],
  controllers: [MetricsController],
  providers: [
    {
      provide: MetricsService,
      useFactory: (appConfig: AppConfigService) =>
        new MetricsService(appConfig.metrics.enabled),
      inject: [AppConfigService],
    },
    {
      provide: METRICS_RECORDER,
      useExisting: MetricsService,
    },
    MetricsAuthGuard,
  ],
  exports: [METRICS_RECORDER],
})
export class MetricsBaseModule {}
