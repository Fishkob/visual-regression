import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from '@config/app-config.module';
import { AppConfigService } from '@config/app-config.service';
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (appConfig: AppConfigService) => ({
        throttlers: [
          {
            ttl: appConfig.throttle.ttl,
            limit: appConfig.throttle.limit,
          },
        ],
      }),
      inject: [AppConfigService],
    }),
  ],
  exports: [ThrottlerModule],
})
export class ThrottleConfigModule {}
