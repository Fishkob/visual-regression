import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { SESSION_COOKIE } from '@common/http/session-cookie';
import { AppConfigService } from '@config/app-config.service';
import { AuthController } from '@internal/auth/auth.controller';
import { AuthService } from '@internal/auth/auth.service';
import { createMock } from '@test/utils/create-mock';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: Mocked<AuthService>;

  const mockAuth = { cookieSecure: false };
  const mockAppConfig = { auth: mockAuth } as unknown as AppConfigService;

  beforeEach(async () => {
    mockAuth.cookieSecure = false;
    mockAuthService = createMock<AuthService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthController,
        { provide: AuthService, useValue: mockAuthService },
        { provide: AppConfigService, useValue: mockAppConfig },
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
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
      totpEnabled: false,
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
      totpEnabled: false,
    });
  });

  it('marks the session cookie secure on an https request', async () => {
    mockAuthService.login.mockResolvedValue({
      token: 'tok123',
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
      totpEnabled: false,
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
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
      totpEnabled: false,
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

  it('returns the current user for me', () => {
    const req = {
      auth: {
        username: 'alice',
        role: 'MEMBER',
        mustChangePassword: false,
        totpEnabled: false,
      },
    };

    const result = controller.me(req as never);

    expect(result).toEqual({
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
      totpEnabled: false,
    });
  });
});
