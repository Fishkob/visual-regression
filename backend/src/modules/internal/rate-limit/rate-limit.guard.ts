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

const LOGIN_KEY_MAX_USERNAME_LENGTH = 128;

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
    const keys = this.bucketKeys(scope, request);

    const now = Date.now();
    for (const key of keys) {
      const { allowed: isAllowed } = await this.rateLimit.tryConsume(
        scope,
        key,
        limit,
      );
      if (!isAllowed) {
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
    }
    return true;
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

  private bucketKeys(
    scope: RateLimitScope,
    request: AuthenticatedRequest,
  ): string[] {
    switch (scope) {
      case 'login': {
        const username = loginUsername(request);
        // Two buckets: the coarse per-IP one stops password spraying across
        // many usernames (each would otherwise mint a fresh bucket), the
        // composite one stops a shared-NAT neighbour from exhausting the
        // bucket of an account they are not targeting.
        return username
          ? [`ip:${request.ip}`, `ip:${request.ip}:user:${username}`]
          : [`ip:${request.ip}`];
      }
      case 'log':
        return [`ip:${request.ip}`];
      case 'upload':
        return [
          request.auth?.apiKeyId
            ? `apikey:${request.auth.apiKeyId}`
            : `session:${request.auth?.username ?? request.ip}`,
        ];
    }
  }
}

// Login is keyed by IP *and* attempted username: an attacker cannot burn one
// shared IP bucket against every account, and normalization (trim, lowercase,
// truncate) keeps `Alice`, `alice `, and a padded payload on one bucket.
function loginUsername(request: AuthenticatedRequest): string | undefined {
  const body = request.body as Record<string, unknown> | undefined;
  const username = body?.username;
  if (typeof username !== 'string') return undefined;
  const normalized = username
    .trim()
    .toLowerCase()
    .slice(0, LOGIN_KEY_MAX_USERNAME_LENGTH);
  return normalized || undefined;
}
