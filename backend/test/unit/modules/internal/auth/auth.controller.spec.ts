import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { SESSION_COOKIE } from '@common/http/session-cookie';
import { AppConfigService } from '@config/app-config.service';
import { AuthController } from '@internal/auth/auth.controller';
import { AuthService } from '@internal/auth/auth.service';
import { TeamsService } from '@internal/teams/teams.service';
import { ProjectScopeService } from '@internal/teams/project-scope.service';
import { ALL_PROJECTS } from '@common/domain/project-scope';
import { API_KEY_SCOPE_KEY } from '@common/http/api-key-scope.decorator';
import { IS_SESSION_ONLY_KEY } from '@common/http/session-only.decorator';
import { createMock } from '@test/utils/create-mock';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: Mocked<AuthService>;
  let mockTeams: Mocked<TeamsService>;
  let mockScopes: Mocked<ProjectScopeService>;

  const mockAuth = { cookieSecure: false };
  const mockAppConfig = { auth: mockAuth } as unknown as AppConfigService;

  beforeEach(async () => {
    mockAuth.cookieSecure = false;
    mockAuthService = createMock<AuthService>();
    mockTeams = createMock<TeamsService>();
    mockTeams.teamsForUser.mockResolvedValue([]);
    mockScopes = createMock<ProjectScopeService>();
    mockScopes.forUser.mockResolvedValue(ALL_PROJECTS);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthController,
        { provide: AuthService, useValue: mockAuthService },
        { provide: AppConfigService, useValue: mockAppConfig },
        { provide: TeamsService, useValue: mockTeams },
        { provide: ProjectScopeService, useValue: mockScopes },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets the session cookie on login', async () => {
    mockAuthService.login.mockResolvedValue({
      token: 'tok123',
      userId: 'u-1',
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
    });
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };

    const result = await controller.login(
      { username: 'alice', password: 'secret' },
      { secure: false, ip: '127.0.0.1', headers: {} } as never,
      res as never,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'tok123',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      }),
    );
    expect(result).toEqual({
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
      seesAllProjects: true,
      teams: [],
    });
  });

  it('marks the session cookie secure on an https request', async () => {
    mockAuthService.login.mockResolvedValue({
      token: 'tok123',
      userId: 'u-1',
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
    });
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };

    await controller.login(
      { username: 'alice', password: 'secret' },
      { secure: true, ip: '127.0.0.1', headers: {} } as never,
      res as never,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'tok123',
      expect.objectContaining({ secure: true }),
    );
  });

  it('marks the session cookie secure when AUTH_COOKIE_SECURE is configured', async () => {
    mockAuth.cookieSecure = true;
    mockAuthService.login.mockResolvedValue({
      token: 'tok123',
      userId: 'u-1',
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
    });
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };

    await controller.login(
      { username: 'alice', password: 'secret' },
      { secure: false, ip: '127.0.0.1', headers: {} } as never,
      res as never,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'tok123',
      expect.objectContaining({ secure: true }),
    );
  });

  it('clears the session cookie on logout', async () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    const req = { headers: { cookie: `${SESSION_COOKIE}=tok` } };

    await controller.logout(req as never, res as never);

    expect(mockAuthService.logout).toHaveBeenCalledWith('tok');
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
  });

  it('returns the current user for me, with the teams it belongs to', async () => {
    mockTeams.teamsForUser.mockResolvedValue([{ id: 't-1', name: 'Checkout' }]);
    const req = {
      auth: {
        username: 'alice',
        userId: 'u-1',
        role: 'MEMBER',
        mustChangePassword: false,
        // The guard resolves this on every authenticated request.
        projectScope: ALL_PROJECTS,
      },
    };

    const result = await controller.me(req as never);

    expect(result).toEqual({
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
      seesAllProjects: true,
      teams: [{ id: 't-1', name: 'Checkout' }],
    });
    expect(mockTeams.teamsForUser).toHaveBeenCalledWith('u-1');
  });

  it('reports no memberships for an api key, which is a credential', async () => {
    const req = {
      auth: {
        username: 'ci-key',
        apiKeyId: 'k-1',
        role: 'MEMBER',
        projectScope: { kind: 'ids', ids: new Set(['p-1']) },
      },
    };

    const result = await controller.me(req as never);

    expect(result.teams).toEqual([]);
    // A key carries the scope the guard resolved for it; `/me` only reads it.
    expect(result.seesAllProjects).toBe(false);
    expect(mockTeams.teamsForUser).not.toHaveBeenCalled();
  });

  it('declares no api-key scope on a session-only route', () => {
    // The guard rejects the api key before it reads the scope, so a session-only
    // route carrying one would describe a decision that cannot happen. Seven
    // handlers did exactly that; this pins the rule for the next one.
    const prototype = AuthController.prototype;
    const offenders = Object.getOwnPropertyNames(prototype).filter((name) => {
      const handler = (prototype as unknown as Record<string, unknown>)[name];
      if (typeof handler !== 'function') return false;
      return (
        Reflect.getMetadata(IS_SESSION_ONLY_KEY, handler) === true &&
        Reflect.getMetadata(API_KEY_SCOPE_KEY, handler) !== undefined
      );
    });

    expect(offenders).toEqual([]);
  });
});
