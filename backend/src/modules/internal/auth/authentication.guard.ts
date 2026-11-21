import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@common/http/public.decorator';
import { IS_SESSION_ONLY_KEY } from '@common/http/session-only.decorator';
import { ROLES_KEY, type AppRole } from '@common/http/roles.decorator';
import {
  PROJECT_ROUTE_KEY,
  type ProjectRouteKind,
} from '@common/http/project-route.decorator';
import { scopeAllows, type ProjectScope } from '@common/domain/project-scope';
import { ProjectScopeService } from '@internal/teams/project-scope.service';
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
// it carries a valid, unexpired session cookie OR a valid api key header.
// Public endpoints are marked with @Public(). Registered as a global APP_GUARD,
// so every endpoint is protected unless explicitly opted out.
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly repo: AuthRepository,
    private readonly apiKeyService: ApiKeyService,
    private readonly appConfig: AppConfigService,
    private readonly projectScopes: ProjectScopeService,
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
        // One resolution per request (ADR-082): the guard checks the named
        // project with it, and the read models below consume the same value.
        const scope = await this.projectScopes.forUser(user.id, user.role);
        request.auth.projectScope = scope;
        await this.enforceProjectRoute(context, request, scope, 'user');
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
        this.enforceApiKeyScopes(context, request);
        const scope = await this.projectScopes.forApiKey({
          ownerId: resolved.ownerId,
          ownerRole: resolved.ownerRole,
          allowlist: resolved.projectIds,
        });
        request.auth.projectScope = scope;
        await this.enforceProjectRoute(context, request, scope, 'apiKey');
        return true;
      }
    }

    throw new UnauthorizedException('Authentication required');
  }

  // What an API key may *do*: its declared scopes. The project allowlist used to
  // be checked here too; it now lives in the one project-scope rule below
  // (ADR-082), so a key and a session answer "which projects" the same way.
  private enforceApiKeyScopes(
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
  }

  // The one place a route's projects are enforced (ADR-082). The route declares
  // what it is (see project-route.decorator.ts); this reads the declaration and
  // answers, it does not guess from the path. A route that declares nothing is
  // refused, so a new endpoint fails closed instead of inheriting "everything".
  private async enforceProjectRoute(
    context: ExecutionContext,
    request: AuthenticatedRequest,
    scope: ProjectScope,
    principalType: 'user' | 'apiKey',
  ): Promise<void> {
    const kind = this.reflector.getAllAndOverride<ProjectRouteKind>(
      PROJECT_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!kind) {
      throw new ForbiddenException('This endpoint declares no project scope');
    }
    if (kind !== 'scoped') {
      // A key restricted to specific projects cannot be handed a cross-project
      // answer yet: the list reads are narrowed in the next step. Declared, not
      // guessed — this is the rule the path regex used to encode, minus the
      // path.
      if (
        principalType === 'apiKey' &&
        (request.auth?.projectIds?.length ?? 0)
      ) {
        throw new ForbiddenException(
          'This API key is restricted to specific projects',
        );
      }
      return;
    }
    const rawProject = request.params?.projectName;
    const projectName = Array.isArray(rawProject) ? rawProject[0] : rawProject;
    // A scoped route may resolve its project from the row it names instead of
    // the path (`DELETE /share-links/:id`); only the owner of that row can
    // check it, so the guard stays out of the way and the service asserts.
    if (!projectName) return;
    // Nothing to refuse, so nothing to look up: an unrestricted principal pays no
    // query for the check (the service still loads the project it needs).
    if (scope.kind === 'all') return;
    const projectId = await this.repo.findProjectIdByName(projectName);
    if (projectId === null) {
      // No such project. A restricted key learns nothing (unrestricted ones
      // returned above, so they keep the service's own 404); a session falls
      // through to the same 404 a foreign project gets — the two answers must
      // not differ.
      if (principalType === 'apiKey') {
        throw new ForbiddenException(
          `API key is not allowed to access project "${projectName}"`,
        );
      }
      return;
    }
    if (scopeAllows(scope, projectId)) return;
    if (principalType === 'apiKey') {
      throw new ForbiddenException(
        `API key is not allowed to access project "${projectName}"`,
      );
    }
    // A distinguishable 403 would confirm that another team's project exists,
    // and project names are user-supplied and guessable — so "not yours" and
    // "no such project" get the same answer.
    throw new NotFoundException(`Project "${projectName}" not found`);
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
