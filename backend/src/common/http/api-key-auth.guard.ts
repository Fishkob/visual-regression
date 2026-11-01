import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '@config/app-config.service';
import { Request } from 'express';

// The operator keys (x-admin-key, x-metrics-key) are compared against a static
// secret. A plain `!==` short-circuits on the first differing byte and leaks the
// length, so the comparison runs over fixed-size digests.
function equalsConstantTime(provided: string, expected: string): boolean {
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export interface ApiKeyAuthOptions {
  header: string;
  getApiKey: (appConfig: AppConfigService) => string;
  disabledMessage: string;
  invalidMessage: string;
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly options: ApiKeyAuthOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const apiKey = this.options.getApiKey(this.appConfig);

    if (!apiKey) {
      throw new UnauthorizedException(this.options.disabledMessage);
    }

    const request = context.switchToHttp().getRequest<Request>();
    const headerKey = request.headers[this.options.header];

    if (
      typeof headerKey !== 'string' ||
      !equalsConstantTime(headerKey, apiKey)
    ) {
      throw new UnauthorizedException(this.options.invalidMessage);
    }

    return true;
  }
}
