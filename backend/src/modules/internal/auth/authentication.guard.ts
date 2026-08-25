import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@common/http/public.decorator';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { readSessionToken } from '@common/http/session-cookie';
import { AppConfigService } from '@config/app-config.service';
import { AuthRepository } from './auth.repository';
import { ApiKeyService } from './api-key.service';
import { hashToken } from './token-hash';

// The single "what does it mean to be authenticated" rule. A request passes if
// it carries a valid, unexpired session cookie OR a valid api key header.
// Public endpoints are marked with @Public(). Registered as a global APP_GUARD
// (Task 10), so every endpoint is protected unless explicitly opted out.
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly repo: AuthRepository,
    private readonly apiKeyService: ApiKeyService,
    private readonly appConfig: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookie = readSessionToken(request.headers.cookie);

    if (cookie) {
      const session = await this.repo.findSessionByTokenHash(hashToken(cookie));
      if (session && session.expiresAt.getTime() > Date.now()) {
        const user = await this.repo.findUserById(session.userId);
        if (!user) {
          // Session outlived its user (deleted account) — do not let it pass.
          throw new UnauthorizedException('Authentication required');
        }
        request.auth = { username: user.username };
        await this.slideSessionExpiry(session.tokenHash, session.expiresAt);
        return true;
      }
    }

    const apiKeyHeader = (this.appConfig.auth.apiKeyHeader ?? '').toLowerCase();
    const apiKey = request.headers[apiKeyHeader];
    if (typeof apiKey === 'string') {
      const resolved = await this.apiKeyService.resolveApiKey(apiKey);
      if (resolved) {
        request.auth = { username: resolved.name, apiKeyId: resolved.id };
        return true;
      }
    }

    throw new UnauthorizedException('Authentication required');
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  // Sliding session expiry: an active session is extended each time it is used,
  // but only once per half of the TTL, so a session that stays in use never
  // expires while still bounding the write volume to at most two per TTL.
  private async slideSessionExpiry(
    tokenHash: string,
    currentExpiry: Date,
  ): Promise<void> {
    const ttlMs = this.appConfig.auth.sessionTtlMs;
    if (currentExpiry.getTime() - Date.now() < ttlMs / 2) {
      await this.repo.extendSessionExpiry(
        tokenHash,
        new Date(Date.now() + ttlMs),
      );
    }
  }
}
