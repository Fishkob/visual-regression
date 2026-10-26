import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@common/http/public.decorator';
import { IS_SESSION_ONLY_KEY } from '@common/http/session-only.decorator';
import { ROLES_KEY, type AppRole } from '@common/http/roles.decorator';
import { ACCOUNT_LIFECYCLE_KEY } from '@common/http/account-lifecycle.decorator';
import {
  API_KEY_SCOPE_KEY,
  type ApiKeyScope,
} from '@common/http/api-key-scope.decorator';
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
      if (
        session &&
        !session.revokedAt &&
        session.expiresAt.getTime() > Date.now()
      ) {
        const user = await this.repo.findUserById(session.userId);
        if (!user?.isActive) {
          // Session outlived its user (deleted/deactivated account) — do not
          // let it pass, and revoke it so a later reactivation cannot revive it.
          await this.repo.deleteSessionsForUser(session.userId);
          throw new UnauthorizedException('Authentication required');
        }
        request.auth = {
          username: user.username,
          userId: user.id,
          sessionId: session.id,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          totpEnabled: user.totpEnabledAt !== null,
        };
        this.enforceSameOrigin(request);
        this.enforceAccess(context, request);
        await this.touchSession(session, request);
        await this.slideSessionExpiry(session.tokenHash, session.expiresAt);
        return true;
      }
    }

    const apiKeyHeader = (this.appConfig.auth.apiKeyHeader ?? '').toLowerCase();
    const apiKey = request.headers[apiKeyHeader];
    if (typeof apiKey === 'string') {
      const resolved = await this.apiKeyService.resolveApiKey(apiKey);
      if (resolved) {
        // A valid api key is authenticated but not privileged: key management
        // would let a leaked CI key mint or revoke credentials for everyone.
        if (this.isSessionOnly(context)) {
          throw new ForbiddenException(
            'This endpoint requires a browser session',
          );
        }
        request.auth = {
          username: resolved.name,
          role: resolved.scopes.includes('admin') ? 'ADMIN' : 'MEMBER',
          apiKeyId: resolved.id,
          scopes: resolved.scopes,
          projectNames: resolved.projectNames,
        };
        this.enforceAccess(context, request);
        this.enforceApiKeyAccess(context, request);
        return true;
      }
    }

    throw new UnauthorizedException('Authentication required');
  }

  // API keys carry explicit scopes and an optional project allowlist. Sessions
  // are governed by the R9 role matrix; keys never inherit the owner's role.
  private enforceApiKeyAccess(
    context: ExecutionContext,
    request: AuthenticatedRequest,
  ): void {
    const auth = request.auth;
    if (!auth?.apiKeyId) return;
    const scopes = auth.scopes ?? [];
    const isAdmin = scopes.includes('admin');
    // The scope is the route's own declaration (see api-key-scope.decorator.ts),
    // not a guess from its path. A route without one is not callable by a key at
    // all: the old fallthrough quietly granted `admin`, so a new write inherited
    // the widest scope by accident.
    const required =
      this.reflector.getAllAndOverride<ApiKeyScope[]>(API_KEY_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? null;
    if (!required) {
      throw new ForbiddenException(
        'This endpoint is not available to API keys',
      );
    }
    if (!isAdmin && !required.some((scope) => scopes.includes(scope))) {
      throw new ForbiddenException(
        `API key is missing the "${required.join('" or "')}" scope`,
      );
    }
    const allowlist = auth.projectNames ?? [];
    if (allowlist.length === 0) return;
    const rawProject = request.params?.projectName;
    const projectName = Array.isArray(rawProject) ? rawProject[0] : rawProject;
    if (projectName) {
      if (!allowlist.includes(projectName)) {
        throw new ForbiddenException(
          `API key is not allowed to access project "${projectName}"`,
        );
      }
      return;
    }
    // Project-spanning reads cannot be safely filtered for a scoped key; a key
    // with an allowlist is confined to project-scoped routes.
    if (
      /^\/api\/v1\/(projects|inbox|audit|users|search)(\/|$)/.test(
        request.path ?? '',
      )
    ) {
      throw new ForbiddenException(
        'This API key is restricted to specific projects',
      );
    }
  }

  // Session cookies are SameSite=Lax, which already blocks most cross-site
  // form posts. This is the second line: an unsafe request that a browser marks
  // cross-site, or whose Origin does not match the Host, is rejected even if a
  // future cookie policy loosens.
  private enforceSameOrigin(request: AuthenticatedRequest): void {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite === 'cross-site') {
      throw new ForbiddenException('Cross-site request rejected');
    }
    const origin = request.headers.origin;
    if (!origin) return;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ForbiddenException('Invalid Origin header');
    }
    if (originHost !== request.headers.host) {
      throw new ForbiddenException('Cross-origin request rejected');
    }
  }

  // Session metadata is for the user's session list, not security; a five
  // minute write throttle keeps the per-request cost bounded.
  private async touchSession(
    session: {
      id: string;
      lastSeenAt: Date | null;
      ip: string | null;
      userAgent: string | null;
    },
    request: AuthenticatedRequest,
  ): Promise<void> {
    const now = Date.now();
    if (
      session.lastSeenAt &&
      now - session.lastSeenAt.getTime() < 5 * 60 * 1000
    ) {
      return;
    }
    await this.repo.touchSession(session.id, {
      lastSeenAt: new Date(now),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
  }

  // Role policy lives with the authentication gate: every authenticated route
  // has an auth object, and both credentials (session and API key) pass through
  // this single enforcement point.
  private enforceAccess(
    context: ExecutionContext,
    request: AuthenticatedRequest,
  ): void {
    const auth = request.auth;
    if (!auth) return;
    const required =
      this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? null;
    if (required && !required.includes(auth.role)) {
      throw new ForbiddenException('Your role cannot perform this action');
    }
    // A VIEWER is read-only: the UI hides write actions, and the API enforces
    // the same rule so a crafted request cannot mutate anything.
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    // The account-lifecycle surface (@AccountLifecycle on the auth controller)
    // is exempt: a VIEWER must still be able to sign out, and the screen that
    // clears `mustChangePassword` has to stay reachable. This used to key off
    // `path.includes('/auth/')`, which also matched a project, test or run
    // literally named `auth` — handing a VIEWER write access to that project.
    const isAccountLifecycle =
      this.reflector.getAllAndOverride<boolean>(ACCOUNT_LIFECYCLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;
    if (auth.role === 'VIEWER' && isWrite && !isAccountLifecycle) {
      throw new ForbiddenException('Viewers have read-only access');
    }
    if (auth.mustChangePassword && !isAccountLifecycle) {
      throw new ForbiddenException('Password change required');
    }
  }

  private isSessionOnly(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_SESSION_ONLY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
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
