import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { ACCOUNT_LIFECYCLE_KEY } from '@common/http/account-lifecycle.decorator';
import { API_KEY_SCOPE_KEY } from '@common/http/api-key-scope.decorator';
import { IS_PUBLIC_KEY } from '@common/http/public.decorator';
import { IS_SESSION_ONLY_KEY } from '@common/http/session-only.decorator';
import { ROLES_KEY } from '@common/http/roles.decorator';
import { AppConfigService } from '@config/app-config.service';
import { ApiKeyService } from '@internal/auth/api-key.service';
import { AuthRepository } from '@internal/auth/auth.repository';
import { AuthenticationGuard } from '@internal/auth/authentication.guard';
import { createMock } from '@test/utils/create-mock';

describe('AuthenticationGuard', () => {
  let guard: AuthenticationGuard;
  let mockRepository: Mocked<AuthRepository>;
  let mockApiKeyService: Mocked<ApiKeyService>;

  const appConfig = {
    auth: {
      apiKeyHeader: 'x-api-key',
      trustedHeader: undefined as string | undefined,
      cookieSecure: false,
      sessionTtlDays: 30,
      sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
      sessionAbsoluteMaxDays: 90,
      sessionAbsoluteMaxMs: 90 * 24 * 60 * 60 * 1000,
    },
  } as unknown as AppConfigService;

  class TestController {}
  const testHandler = () => {};
  // A GET route that declares the read scope, for the tests that build their
  // own context instead of using apiKeyContext.
  const readScopedHandler = () => {};
  Reflect.defineMetadata(API_KEY_SCOPE_KEY, ['read'], readScopedHandler);

  const response = { cookie: vi.fn() };

  const mockContext = (
    headers: Record<string, unknown> = {},
    handler: () => void = testHandler,
  ) =>
    ({
      getClass: () => TestController,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          method: 'GET',
          path: '/api/v1/projects',
          secure: false,
        }),
        getResponse: () => response,
      }),
    }) as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

  const mockSession = (expiresAt: Date) => ({
    id: 's1',
    tokenHash: 'hash',
    userId: 'u1',
    expiresAt,
    revokedAt: null,
    lastSeenAt: null,
    ip: null,
    userAgent: null,
    createdAt: new Date(),
  });

  beforeEach(async () => {
    response.cookie.mockClear();
    appConfig.auth.trustedHeader = undefined;
    mockRepository = createMock<AuthRepository>();
    mockApiKeyService = createMock<ApiKeyService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationGuard,
        { provide: Reflector, useValue: new Reflector() },
        { provide: AuthRepository, useValue: mockRepository },
        { provide: ApiKeyService, useValue: mockApiKeyService },
        { provide: AppConfigService, useValue: appConfig },
      ],
    }).compile();

    guard = module.get(AuthenticationGuard);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows public endpoints without credentials', async () => {
    const publicHandler = () => {};
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, publicHandler);

    await expect(
      guard.canActivate(mockContext({}, publicHandler)),
    ).resolves.toBe(true);
  });

  it('rejects a request with no session and no api key', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(null);
    mockApiKeyService.resolveApiKey.mockResolvedValue(null);

    await expect(guard.canActivate(mockContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a valid session cookie', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });

    await expect(
      guard.canActivate(mockContext({ cookie: 'vrt_session=tok' })),
    ).resolves.toBe(true);
    expect(mockRepository.findSessionByTokenHash).toHaveBeenCalledWith(
      createHash('sha256').update('tok').digest('hex'),
    );
  });

  it('attaches the authenticated username for a valid session', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });

    const request = { headers: { cookie: 'vrt_session=tok' } };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => testHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockRepository.findUserById).toHaveBeenCalledWith('u1');
    expect((request as { auth?: { username: string } }).auth).toEqual({
      username: 'alice',
      userId: 'u1',
      sessionId: 's1',
      role: 'MEMBER',
      mustChangePassword: false,
    });
  });

  it('rejects a revoked session', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue({
      ...mockSession(new Date(Date.now() + 60_000)),
      revokedAt: new Date(),
    });

    await expect(
      guard.canActivate(mockContext({ cookie: 'vrt_session=tok' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('records session metadata at most once per five minutes', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });
    mockRepository.touchSession.mockResolvedValue(undefined);

    const request = {
      headers: { cookie: 'vrt_session=tok', 'user-agent': 'test-agent' },
      method: 'GET',
      path: '/api/v1/projects',
      ip: '10.0.0.1',
    };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => testHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await guard.canActivate(ctx);
    expect(mockRepository.touchSession).toHaveBeenCalledWith('s1', {
      lastSeenAt: expect.any(Date),
      ip: '10.0.0.1',
      userAgent: 'test-agent',
    });
  });

  it('rejects a cross-site session write', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });
    const request = {
      headers: {
        cookie: 'vrt_session=tok',
        'sec-fetch-site': 'cross-site',
      },
      method: 'POST',
      path: '/api/v1/projects',
    };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => testHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a session write whose Origin does not match Host', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });
    const request = {
      headers: {
        cookie: 'vrt_session=tok',
        origin: 'https://evil.test',
        host: 'vrt.test',
      },
      method: 'POST',
      path: '/api/v1/projects',
    };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => testHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects an expired session', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() - 60_000)),
    );

    await expect(
      guard.canActivate(mockContext({ cookie: 'vrt_session=tok' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a session whose user was deleted', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue(null);

    await expect(
      guard.canActivate(mockContext({ cookie: 'vrt_session=tok' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('extends the session expiry only when more than half the ttl elapsed', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });
    mockRepository.extendSessionExpiry.mockResolvedValue(undefined);

    await guard.canActivate(mockContext({ cookie: 'vrt_session=tok' }));
    expect(mockRepository.extendSessionExpiry).toHaveBeenCalledWith(
      'hash',
      expect.any(Date),
    );
  });

  it('ends a session that outlived the absolute lifetime', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue({
      ...mockSession(new Date(Date.now() + 60_000)),
      createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    });
    mockRepository.deleteSessionByTokenHash.mockResolvedValue(undefined);

    await expect(
      guard.canActivate(mockContext({ cookie: 'vrt_session=tok' })),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockRepository.deleteSessionByTokenHash).toHaveBeenCalledWith(
      'hash',
    );
    expect(mockRepository.extendSessionExpiry).not.toHaveBeenCalled();
  });

  it('refreshes the browser cookie when it slides the session', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });

    await guard.canActivate(mockContext({ cookie: 'vrt_session=tok' }));

    expect(response.cookie).toHaveBeenCalledWith(
      'vrt_session',
      'tok',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('does not write on a freshly-extended session', async () => {
    const fresh = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    mockRepository.findSessionByTokenHash.mockResolvedValue(mockSession(fresh));
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });

    await guard.canActivate(mockContext({ cookie: 'vrt_session=tok' }));
    expect(mockRepository.extendSessionExpiry).not.toHaveBeenCalled();
  });

  it('accepts a valid api key header and names the caller', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(null);
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['upload', 'read', 'approve'],
      projectIds: [],
    });

    const request = {
      headers: { 'x-api-key': 'rawkey' },
      method: 'GET',
      path: '/api/v1/projects',
    };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => readScopedHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockApiKeyService.resolveApiKey).toHaveBeenCalledWith('rawkey');
    expect(
      (request as { auth?: { username: string; apiKeyId?: string } }).auth,
    ).toEqual({
      username: 'ci',
      role: 'MEMBER',
      apiKeyId: 'k1',
      scopes: ['upload', 'read', 'approve'],
      projectIds: [],
    });
  });

  it('rejects a member when the endpoint requires an admin', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });
    const adminHandler = () => {};
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], adminHandler);

    await expect(
      guard.canActivate(
        mockContext({ cookie: 'vrt_session=tok' }, adminHandler),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects every write for a viewer but allows reads', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'VIEWER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });
    const request = {
      headers: { cookie: 'vrt_session=tok' },
      method: 'POST',
      path: '/api/v1/projects/p/tests/t/approval',
    };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => testHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

    request.method = 'GET';
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('blocks every route until a forced password change, except account lifecycle', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: true,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });
    const request = {
      headers: { cookie: 'vrt_session=tok' },
      method: 'GET',
      path: '/api/v1/projects',
    };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => testHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

    // The exemption is route metadata, not a path substring: the auth
    // controller carries @AccountLifecycle so the screen that clears the flag
    // stays reachable.
    Reflect.defineMetadata(ACCOUNT_LIFECYCLE_KEY, true, TestController);
    request.path = '/api/v1/projects';
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    Reflect.deleteMetadata(ACCOUNT_LIFECYCLE_KEY, TestController);
  });

  it('does not exempt a project named auth from the viewer write ban', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(
      mockSession(new Date(Date.now() + 60_000)),
    );
    mockRepository.findUserById.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'VIEWER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
    });
    const request = {
      headers: { cookie: 'vrt_session=tok' },
      method: 'PATCH',
      // Contains '/auth/' but is a project route: the old substring check let a
      // viewer write here.
      path: '/api/v1/projects/auth/branches',
    };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => testHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Viewers have read-only access',
    );
  });

  function apiKeyContext(options: {
    method: string;
    path: string;
    params?: Record<string, string>;
    scope?: string[];
  }) {
    const request = {
      headers: { 'x-api-key': 'rawkey' },
      method: options.method,
      path: options.path,
      params: options.params ?? {},
    };
    // The scope is route metadata now; a route that declares none is not
    // callable by a key at all.
    const handler = () => {};
    if (options.scope) {
      Reflect.defineMetadata(API_KEY_SCOPE_KEY, options.scope, handler);
    }
    return {
      getClass: () => TestController,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];
  }

  it('requires the read scope for reads', async () => {
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['upload'],
      projectIds: [],
    });

    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'GET',
          path: '/api/v1/projects/p',
          scope: ['read'],
        }),
      ),
    ).rejects.toThrow(/missing the "read" scope/);
  });

  it('lets an upload-only key upload and read its own job status', async () => {
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['upload'],
      projectIds: [],
    });

    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'POST',
          path: '/api/v1/projects/p/tests/t/upload',
          scope: ['upload'],
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'GET',
          path: '/api/v1/projects/p/tests/t/jobs/j1',
          scope: ['read', 'upload'],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('requires approve for approvals and admin for other writes', async () => {
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['upload', 'read'],
      projectIds: [],
    });

    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'POST',
          path: '/api/v1/projects/p/tests/t/approval',
          scope: ['approve'],
        }),
      ),
    ).rejects.toThrow(/missing the "approve" scope/);
    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'DELETE',
          path: '/api/v1/projects/p',
          scope: ['admin'],
        }),
      ),
    ).rejects.toThrow(/missing the "admin" scope/);
  });

  it('accepts an approve key on the PDF approval route', async () => {
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['approve'],
      projectIds: [],
    });

    // The old path table matched '/approval' only, so the hyphenated
    // '/pdf-approval' fell through to admin — a PDF approval was not possible
    // with an approve-scoped key, against ADR-035.
    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'POST',
          path: '/api/v1/projects/p/tests/t/pdf-approval',
          scope: ['approve'],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('refuses an api key on a route that declares no scope', async () => {
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['read', 'upload', 'approve', 'admin'],
      projectIds: [],
    });

    // Fail closed: the old table defaulted an unannotated write to admin, so a
    // new endpoint inherited the widest scope by accident.
    await expect(
      guard.canActivate(
        apiKeyContext({ method: 'POST', path: '/api/v1/new/route' }),
      ),
    ).rejects.toThrow(/not available to API keys/);
  });

  it('confines a key with a project allowlist', async () => {
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['read'],
      projectIds: ['p-allowed'],
    });
    mockRepository.findProjectIdByName.mockImplementation((name: string) =>
      Promise.resolve(name === 'allowed' ? 'p-allowed' : null),
    );

    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'GET',
          path: '/api/v1/projects/other/runs',
          params: { projectName: 'other' },
          scope: ['read'],
        }),
      ),
    ).rejects.toThrow(/not allowed to access project "other"/);
    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'GET',
          path: '/api/v1/projects/allowed/runs',
          params: { projectName: 'allowed' },
          scope: ['read'],
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'GET',
          path: '/api/v1/projects',
          scope: ['read'],
        }),
      ),
    ).rejects.toThrow(/restricted to specific projects/);
  });

  it('keeps an allowlisted key out of the cross-project review inbox', async () => {
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['read'],
      projectIds: ['p-allowed'],
    });

    // Neither route names a project, so an allowlist cannot filter them: they
    // used to return every project's pending work and group list.
    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'GET',
          path: '/api/v1/review/pending',
          scope: ['read'],
        }),
      ),
    ).rejects.toThrow(/restricted to specific projects/);
    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'GET',
          path: '/api/v1/groups',
          scope: ['read'],
        }),
      ),
    ).rejects.toThrow(/restricted to specific projects/);
  });

  it('grants the admin role to a key with the admin scope', async () => {
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['admin'],
      projectIds: [],
    });

    await expect(
      guard.canActivate(
        apiKeyContext({
          method: 'DELETE',
          path: '/api/v1/projects/p',
          scope: ['admin'],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects an invalid api key', async () => {
    mockRepository.findSessionByTokenHash.mockResolvedValue(null);
    mockApiKeyService.resolveApiKey.mockResolvedValue(null);

    await expect(
      guard.canActivate(mockContext({ 'x-api-key': 'rawkey' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('matches a mixed-case configured api key header', async () => {
    appConfig.auth.apiKeyHeader = 'X-Api-Key';
    mockRepository.findSessionByTokenHash.mockResolvedValue(null);
    mockApiKeyService.resolveApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      ownerId: 'u1',
      scopes: ['upload', 'read', 'approve'],
      projectIds: [],
    });

    await expect(
      guard.canActivate(
        mockContext({ 'x-api-key': 'rawkey' }, readScopedHandler),
      ),
    ).resolves.toBe(true);
    expect(mockApiKeyService.resolveApiKey).toHaveBeenCalledWith('rawkey');

    appConfig.auth.apiKeyHeader = 'x-api-key';
  });

  describe('session-only endpoints', () => {
    const sessionOnlyHandler = () => {};
    Reflect.defineMetadata(IS_SESSION_ONLY_KEY, true, sessionOnlyHandler);

    it('rejects a valid api key with 403', async () => {
      mockRepository.findSessionByTokenHash.mockResolvedValue(null);
      mockApiKeyService.resolveApiKey.mockResolvedValue({
        id: 'k1',
        name: 'ci',
        ownerId: 'u1',
        scopes: ['upload', 'read', 'approve'],
        projectIds: [],
      });

      await expect(
        guard.canActivate(
          mockContext({ 'x-api-key': 'rawkey' }, sessionOnlyHandler),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not attach an identity for the rejected api key', async () => {
      mockRepository.findSessionByTokenHash.mockResolvedValue(null);
      mockApiKeyService.resolveApiKey.mockResolvedValue({
        id: 'k1',
        name: 'ci',
        ownerId: 'u1',
        scopes: ['upload', 'read', 'approve'],
        projectIds: [],
      });

      const request = {
        headers: { 'x-api-key': 'rawkey' },
        method: 'GET',
        path: '/api/v1/projects',
      };
      const ctx = {
        getClass: () => TestController,
        getHandler: () => sessionOnlyHandler,
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect((request as { auth?: unknown }).auth).toBeUndefined();
    });

    it('accepts a session cookie', async () => {
      mockRepository.findSessionByTokenHash.mockResolvedValue(
        mockSession(new Date(Date.now() + 60_000)),
      );
      mockRepository.findUserById.mockResolvedValue({
        id: 'u1',
        username: 'alice',
        passwordHash: 'salt:hash',
        role: 'MEMBER',
        isActive: true,
        mustChangePassword: false,
        deactivatedAt: null,
        createdBy: null,
        createdAt: new Date(),
      });

      await expect(
        guard.canActivate(
          mockContext({ cookie: 'vrt_session=tok' }, sessionOnlyHandler),
        ),
      ).resolves.toBe(true);
    });

    it('honours the metadata when it sits on the controller class', async () => {
      Reflect.defineMetadata(IS_SESSION_ONLY_KEY, true, TestController);
      mockRepository.findSessionByTokenHash.mockResolvedValue(null);
      mockApiKeyService.resolveApiKey.mockResolvedValue({
        id: 'k1',
        name: 'ci',
        ownerId: 'u1',
        scopes: ['upload', 'read', 'approve'],
        projectIds: [],
      });

      await expect(
        guard.canActivate(mockContext({ 'x-api-key': 'rawkey' })),
      ).rejects.toThrow(ForbiddenException);

      Reflect.deleteMetadata(IS_SESSION_ONLY_KEY, TestController);
    });
  });

  describe('trusted header', () => {
    type UserRow = NonNullable<
      Awaited<ReturnType<AuthRepository['findUserByUsername']>>
    >;

    const trustedUser = (overrides: Partial<UserRow> = {}): UserRow => ({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date(),
      ...overrides,
    });

    const requestContext = (
      request: Record<string, unknown>,
      handler: () => void = testHandler,
    ) =>
      ({
        getClass: () => TestController,
        getHandler: () => handler,
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      }) as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    beforeEach(() => {
      appConfig.auth.trustedHeader = 'x-auth-request-user';
      mockRepository.findSessionByTokenHash.mockResolvedValue(null);
      mockApiKeyService.resolveApiKey.mockResolvedValue(null);
    });

    it('accepts the identity its proxy named', async () => {
      mockRepository.findUserByUsername.mockResolvedValue(trustedUser());
      const request: Record<string, unknown> = {
        headers: { 'x-auth-request-user': 'alice' },
        method: 'GET',
        path: '/api/v1/projects',
      };

      await expect(guard.canActivate(requestContext(request))).resolves.toBe(
        true,
      );
      expect(mockRepository.findUserByUsername).toHaveBeenCalledWith('alice');
      expect(request.auth).toEqual({
        username: 'alice',
        userId: 'u1',
        role: 'MEMBER',
        mustChangePassword: false,
      });
    });

    it('trims a padded username', async () => {
      mockRepository.findUserByUsername.mockResolvedValue(trustedUser());

      await expect(
        guard.canActivate(mockContext({ 'x-auth-request-user': '  alice  ' })),
      ).resolves.toBe(true);
      expect(mockRepository.findUserByUsername).toHaveBeenCalledWith('alice');
    });

    it('ignores the header when no trusted header is configured', async () => {
      appConfig.auth.trustedHeader = undefined;
      mockRepository.findUserByUsername.mockResolvedValue(trustedUser());

      await expect(
        guard.canActivate(mockContext({ 'x-auth-request-user': 'alice' })),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRepository.findUserByUsername).not.toHaveBeenCalled();
    });

    it('rejects a header that names nobody active', async () => {
      mockRepository.findUserByUsername.mockResolvedValue(
        trustedUser({ isActive: false }),
      );
      await expect(
        guard.canActivate(mockContext({ 'x-auth-request-user': 'alice' })),
      ).rejects.toThrow(UnauthorizedException);

      mockRepository.findUserByUsername.mockResolvedValue(null);
      await expect(
        guard.canActivate(mockContext({ 'x-auth-request-user': 'mallory' })),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('keeps a restricted api key ahead of the proxy identity', async () => {
      mockApiKeyService.resolveApiKey.mockResolvedValue({
        id: 'k1',
        name: 'ci',
        ownerId: 'u9',
        scopes: ['read'],
        projectIds: ['p1'],
      });
      mockRepository.findProjectIdByName.mockResolvedValue('p1');
      mockRepository.findUserByUsername.mockResolvedValue(
        trustedUser({ role: 'ADMIN' }),
      );
      const request: Record<string, unknown> = {
        headers: {
          'x-api-key': 'rawkey',
          'x-auth-request-user': 'alice',
        },
        method: 'GET',
        path: '/api/v1/projects/p1/tests',
        params: { projectName: 'p1' },
      };

      await expect(
        guard.canActivate(requestContext(request, readScopedHandler)),
      ).resolves.toBe(true);
      expect(request.auth).toMatchObject({
        username: 'ci',
        apiKeyId: 'k1',
        role: 'MEMBER',
        projectIds: ['p1'],
      });
      expect(mockRepository.findUserByUsername).not.toHaveBeenCalled();
    });

    it('rejects a cross-site write that arrived through the proxy', async () => {
      mockRepository.findUserByUsername.mockResolvedValue(trustedUser());
      const request: Record<string, unknown> = {
        headers: {
          'x-auth-request-user': 'alice',
          'sec-fetch-site': 'cross-site',
        },
        method: 'POST',
        path: '/api/v1/projects',
      };

      await expect(guard.canActivate(requestContext(request))).rejects.toThrow(
        ForbiddenException,
      );
      expect(request.auth).toBeUndefined();
    });

    it('applies the viewer write ban to a proxy identity', async () => {
      mockRepository.findUserByUsername.mockResolvedValue(
        trustedUser({ role: 'VIEWER' }),
      );
      const request: Record<string, unknown> = {
        headers: { 'x-auth-request-user': 'alice' },
        method: 'POST',
        path: '/api/v1/projects/p/tests/t/approval',
      };

      await expect(guard.canActivate(requestContext(request))).rejects.toThrow(
        ForbiddenException,
      );

      request.method = 'GET';
      await expect(guard.canActivate(requestContext(request))).resolves.toBe(
        true,
      );
    });

    it('allows a proxy identity on a session-only route', async () => {
      const sessionOnlyHandler = () => {};
      Reflect.defineMetadata(IS_SESSION_ONLY_KEY, true, sessionOnlyHandler);
      mockRepository.findUserByUsername.mockResolvedValue(trustedUser());

      const ctx = {
        getClass: () => TestController,
        getHandler: () => sessionOnlyHandler,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-auth-request-user': 'alice' },
            method: 'GET',
            path: '/api/v1/auth/sessions',
          }),
          getResponse: () => response,
        }),
      } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });
});
