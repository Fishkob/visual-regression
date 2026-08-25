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

  const mockAppConfig = {
    auth: { cookieSecure: false },
  } as unknown as AppConfigService;

  beforeEach(async () => {
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
    });
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };

    const result = await controller.login(
      { username: 'alice', password: 'secret' },
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
    expect(result).toEqual({ username: 'alice' });
  });

  it('clears the session cookie on logout', async () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    const req = { headers: { cookie: `${SESSION_COOKIE}=tok` } };

    await controller.logout(req as never, res as never);

    expect(mockAuthService.logout).toHaveBeenCalledWith('tok');
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
  });

  it('returns the current user for me', () => {
    const req = { auth: { username: 'alice' } };

    const result = controller.me(req as never);

    expect(result).toEqual({ username: 'alice' });
  });
});
