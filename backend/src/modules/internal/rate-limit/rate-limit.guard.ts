import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { AppConfigService } from '@config/app-config.service';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { METRICS } from '@common/domain/metrics-catalog';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { RateLimitService } from './rate-limit.service';
import { retryAfterSeconds } from './rate-limit-window';
import { RATE_LIMIT_SCOPE_KEY, RateLimitScope } from './rate-limit.decorator';

// The single rate-limit rule: consume one unit from the scope's one-minute
// bucket in Postgres. Registered as a global APP_GUARD after the
// AuthenticationGuard; a pass-through on every route that carries no
// @RateLimit decorator. Runs before route interceptors, so a rejected upload
// never reaches multer, storage, or the workflow.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly appConfig: AppConfigService,
    private readonly rateLimit: RateLimitService,
    @Inject(METRICS_RECORDER) private readonly metrics: IMetricsRecorder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<RateLimitScope>(
      RATE_LIMIT_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) return true;

    const limit = this.limitFor(scope);
    if (limit <= 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = this.bucketKey(scope, request);
    if (!key) return true;

    const now = Date.now();
    const { allowed: isAllowed } = await this.rateLimit.tryConsume(
      scope,
      key,
      limit,
    );
    if (isAllowed) return true;

    this.metrics.incrementCounter(METRICS.rateLimitedTotal, { scope });
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(retryAfterSeconds(now)));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Rate limit exceeded for ${scope}. Retry after the current minute window.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private limitFor(scope: RateLimitScope): number {
    switch (scope) {
      case 'login':
        return this.appConfig.loginRateLimitPerMinute;
      case 'log':
        return this.appConfig.logRateLimitPerMinute;
      case 'upload':
        return this.appConfig.uploadRateLimitPerMinute;
    }
  }

  private bucketKey(
    scope: RateLimitScope,
    request: AuthenticatedRequest,
  ): string | undefined {
    switch (scope) {
      case 'login':
      case 'log':
        return `ip:${request.ip}`;
      case 'upload':
        return request.auth?.apiKeyId
          ? `apikey:${request.auth.apiKeyId}`
          : undefined;
    }
  }
}
