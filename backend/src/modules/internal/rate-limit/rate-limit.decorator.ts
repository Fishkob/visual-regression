import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_SCOPE_KEY = 'rateLimitScope';

export type RateLimitScope = 'login' | 'log' | 'upload';

export const RateLimit = (scope: RateLimitScope) =>
  SetMetadata(RATE_LIMIT_SCOPE_KEY, scope);
