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
import { isCredentialLive } from './credential-liveness.policy';
import {
  API_KEY_SCOPE_KEY,
  type ApiKeyScope,
} from '@common/http/api-key-scope.decorator';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import {
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@common/http/session-cookie';
import type { Response } from 'express';
import { AppConfigService } from '@config/app-config.service';
import { AuthRepository } from './auth.repository';
import { ApiKeyService } from './api-key.service';
import { hashToken } from './token-hash';

// The single "what does it mean to be authenticated" rule. A request passes if
// it carries a valid, unexpired session cookie OR a valid api key header, or —
// when the deployment configures AUTH_TRUSTED_HEADER — an identity its
// authenticating proxy already established (ADR-077). Public endpoints are
// marked with @Public(). Registered as a global APP_GUARD (Task 10), so every
// endpoint is protected unless explicitly opted out.
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
      if (session && isCredentialLive(session)) {
        // Sliding expiry alone means a stolen cookie that is used once per TTL
        // never dies. The absolute cap is measured from the row's createdAt and
        // ends the session regardless of activity.
        if (this.isBeyondAbsoluteLifetime(session)) {
          await this.repo.deleteSessionByTokenHash(session.tokenHash);
          throw new UnauthorizedException('Authentication required');
        }
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
        };
        this.enforceSameOrigin(request);
        this.enforceAccess(context, request);
        await this.touchSession(session, request);
        await this.slideSessionExpiry(session, request, context);
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
          projectIds: resolved.projectIds,
        };
        this.enforceAccess(context, request);
        await this.enforceApiKeyAccess(context, request);
        return true;
      }
    }

    // The trusted header is checked last on purpose: a proxy in front of the
    // API injects it on every request that passes through, including a CI job's
    // API-key call, so letting it win would drop that key's scopes and its
    // project allowlist and hand the key the human's reach instead.
    const trusted = await this.resolveTrustedIdentity(request);
    if (trusted) {
      // The proxy authenticates the browser, so a cross-site form post to the
      // dashboard arrives with the header already attached — the SameSite
      // protection a cookie would carry is not there. Apply the same rule the
      // session path does, before the identity is attached so a rejected
      // request carries none.
      this.enforceSameOrigin(request);
      request.auth = trusted;
      this.enforceAccess(context, request);
      return true;
    }

    throw new UnauthorizedException('Authentication required');
  }

  // Trusted-header credentials: the deployment's authenticating proxy (an IdP
  // sidecar, oauth2-proxy, an ingress with auth) has already identified the
  // caller and put the username in the configured header. The identity must
  // already exist as an active user — auto-provisioning would make a header a
  // way to mint accounts — and it carries that user's own role, like a session.
  private async resolveTrustedIdentity(
    request: AuthenticatedRequest,
  ): Promise<AuthenticatedRequest['auth'] | null> {
    const headerName = (this.appConfig.auth.trustedHeader ?? '').toLowerCase();
    if (!headerName) return null;
    const raw = request.headers[headerName];
    const username = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!username) return null;
    const user = await this.repo.findUserByUsername(username);
    if (!user?.isActive) {
      // Same answer as a wrong password: the header names nobody this
      // installation serves, and which of the two it is is not the caller's
      // business.
      throw new UnauthorizedException('Authentication required');
    }
    return {
      username: user.username,
      userId: user.id,
      role: user.role,
      // The local password is not part of this credential. A trusted-header
      // user never proves one, so an unfinished invite link (mustChangePassword)
      // must not lock them out of the dashboard their proxy just authenticated.
      mustChangePassword: false,
    };
  }

  // API keys carry explicit scopes and an optional project allowlist. Sessions
  // are governed by the R9 role matrix; keys never inherit the owner's role.
  private async enforceApiKeyAccess(
    context: ExecutionContext,
    request: AuthenticatedRequest,
  ): Promise<void> {
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
    // The allowlist holds ids, so a rename neither narrows nor widens a key and
    // a recycled name cannot inherit another project's access. The route only
    // knows the name, so it is resolved once here.
    const allowlist = auth.projectIds ?? [];
    if (allowlist.length === 0) return;
    const rawProject = request.params?.projectName;
    const projectName = Array.isArray(rawProject) ? rawProject[0] : rawProject;
    if (projectName) {
      const projectId = await this.repo.findProjectIdByName(projectName);
      if (!projectId || !allowlist.includes(projectId)) {
        throw new ForbiddenException(
          `API key is not allowed to access project "${projectName}"`,
        );
      }
      return;
    }
    // Project-spanning reads cannot be safely filtered for a scoped key; a key
    // with an allowlist is confined to project-scoped routes. `review` (the
    // cross-project inbox) and `groups` belong in this list: neither names a
    // project, and both returned every project's rows to an allowlisted key.
    if (
      /^\/api\/v1\/(projects|review|groups|inbox|audit|users|search)(\/|$)/.test(
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

  private isBeyondAbsoluteLifetime(session: { createdAt: Date }): boolean {
    const absoluteMaxMs = this.appConfig.auth.sessionAbsoluteMaxMs;
    if (!absoluteMaxMs || absoluteMaxMs <= 0) return false;
    return Date.now() >= session.createdAt.getTime() + absoluteMaxMs;
  }

  // Sliding session expiry: an active session is extended each time it is used,
  // but only once per half of the TTL, so a session that stays in use never
  // expires while still bounding the write volume to at most two per TTL. The
  // browser cookie carries the same deadline: refreshing only the row would make
  // the server slide a session the browser has already dropped.
  private async slideSessionExpiry(
    session: { tokenHash: string; expiresAt: Date; createdAt: Date },
    request: AuthenticatedRequest,
    context: ExecutionContext,
  ): Promise<void> {
    const ttlMs = this.appConfig.auth.sessionTtlMs;
    const now = Date.now();
    if (session.expiresAt.getTime() - now >= ttlMs / 2) return;

    const absoluteMaxMs = this.appConfig.auth.sessionAbsoluteMaxMs;
    const cap =
      absoluteMaxMs && absoluteMaxMs > 0
        ? session.createdAt.getTime() + absoluteMaxMs
        : Number.MAX_SAFE_INTEGER;
    const nextExpiry = new Date(Math.min(now + ttlMs, cap));
    if (nextExpiry.getTime() <= session.expiresAt.getTime()) return;

    await this.repo.extendSessionExpiry(session.tokenHash, nextExpiry);

    const token = readSessionToken(request.headers.cookie);
    if (!token) return;
    const response = context.switchToHttp().getResponse<Response>();
    response.cookie(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(
        this.appConfig.auth.cookieSecure || request.secure,
        Math.max(0, nextExpiry.getTime() - now),
      ),
    );
  }
}
