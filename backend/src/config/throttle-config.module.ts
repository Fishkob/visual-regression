import { Module } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerOptions,
} from '@nestjs/throttler';
import { AppConfigModule } from '@config/app-config.module';
import { AppConfigService } from '@config/app-config.service';

// @nestjs/throttler v6 applies every named throttler to every route unless it
// is skipped, so the login/log throttles are scoped to their own handlers via
// skipIf while the `default` throttler keeps covering all routes (a throttler
// without a name resolves to `default`). Limits come from AppConfigService
// (Joi-validated env) at module init, so env values are honored — decorator
// metadata, in contrast, is evaluated at import time before ConfigModule
// loads the env files.
const isLoginRoute = (context: ExecutionContext): boolean =>
  context.getClass().name === 'AuthController' &&
  context.getHandler().name === 'login';

const isLogIngestionRoute = (context: ExecutionContext): boolean =>
  context.getClass().name === 'LogIngestionController' &&
  context.getHandler().name === 'ingest';

type ThrottlerOptionsRecord = Extract<
  ThrottlerModuleOptions,
  { throttlers: ThrottlerOptions[] }
>;

export function createThrottlerOptions(
  appConfig: AppConfigService,
): ThrottlerOptionsRecord {
  return {
    throttlers: [
      {
        name: 'default',
        ttl: appConfig.throttle.ttlMs,
        limit: appConfig.throttle.limit,
      },
      {
        name: 'login',
        ttl: appConfig.loginThrottle.ttlMs,
        limit: appConfig.loginThrottle.limit,
        skipIf: (context) => !isLoginRoute(context),
      },
      {
        name: 'log',
        ttl: appConfig.logThrottle.ttlMs,
        limit: appConfig.logThrottle.limit,
        skipIf: (context) => !isLogIngestionRoute(context),
      },
    ],
  };
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: createThrottlerOptions,
      inject: [AppConfigService],
    }),
  ],
  exports: [ThrottlerModule],
})
export class ThrottleConfigModule {}
