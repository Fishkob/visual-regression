import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '@config/app-config.service';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { METRICS } from '@common/domain/metrics-catalog';
import { UploadRateLimitService } from '@public/visualTest/intake/application/upload-rate-limit.service';
import {
  computeWindowStart,
  retryAfterSeconds,
} from '@public/visualTest/intake/application/upload-rate-limit-window';

// Per-key upload rate limit, layered on top of the global/IP throttle. Only
// API-key-authenticated requests are counted (browser sessions have no
// apiKeyId and stay under the global throttler). The check runs before the
// upload handler, so a rejected request never reaches storage or the workflow.
@Injectable()
export class UploadRateLimitGuard implements CanActivate {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly rateLimit: UploadRateLimitService,
    @Inject(METRICS_RECORDER) private readonly metrics: IMetricsRecorder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const apiKeyId = request.auth?.apiKeyId;
    const limit = this.appConfig.uploadRateLimitPerMinute;

    if (!apiKeyId || limit <= 0) {
      return true;
    }

    const now = Date.now();
    const { allowed: isAllowed } = await this.rateLimit.tryConsume(
      apiKeyId,
      computeWindowStart(now),
      limit,
    );
    if (isAllowed) {
      return true;
    }

    this.metrics.incrementCounter(METRICS.uploadRateLimitedTotal, {
      key: request.auth?.username ?? apiKeyId,
    });
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(retryAfterSeconds(now)));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message:
          'Upload rate limit exceeded. Retry after the current minute window.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
