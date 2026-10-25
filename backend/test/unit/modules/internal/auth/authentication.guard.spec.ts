import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
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
      sessionTtlDays: 30,
      sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    },
  } as unknown as AppConfigService;

  class TestController {}
  const testHandler = () => {};

  const mockContext = (
    headers: Record<string, unknown> = {},
    handler: () => void = testHandler,
  ) =>
    ({
      getClass: () => TestController,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

  const mockSession = (expiresAt: Date) => ({
    id: 's1',
    tokenHash: 'hash',
    userId: 'u1',
    expiresAt,
  });

  beforeEach(async () => {
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
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockRepository.findUserById).toHaveBeenCalledWith('u1');
    expect((request as { auth?: { username: string } }).auth).toEqual({
      username: 'alice',
      userId: 'u1',
      role: 'MEMBER',
      mustChangePassword: false,
    });
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
    });

    const request = { headers: { 'x-api-key': 'rawkey' } };
    const ctx = {
      getClass: () => TestController,
      getHandler: () => testHandler,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockApiKeyService.resolveApiKey).toHaveBeenCalledWith('rawkey');
    expect(
      (request as { auth?: { username: string; apiKeyId?: string } }).auth,
    ).toEqual({
      username: 'ci',
      role: 'MEMBER',
      apiKeyId: 'k1',
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
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

    request.method = 'GET';
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('blocks non-auth routes until a forced password change', async () => {
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
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as Parameters<AuthenticationGuard['canActivate']>[0];

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

    request.path = '/api/v1/auth/me';
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
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
    });

    await expect(
      guard.canActivate(mockContext({ 'x-api-key': 'rawkey' })),
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
      });

      const request = { headers: { 'x-api-key': 'rawkey' } };
      const ctx = {
        getClass: () => TestController,
        getHandler: () => sessionOnlyHandler,
        switchToHttp: () => ({ getRequest: () => request }),
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
      });

      await expect(
        guard.canActivate(mockContext({ 'x-api-key': 'rawkey' })),
      ).rejects.toThrow(ForbiddenException);

      Reflect.deleteMetadata(IS_SESSION_ONLY_KEY, TestController);
    });
  });
});
