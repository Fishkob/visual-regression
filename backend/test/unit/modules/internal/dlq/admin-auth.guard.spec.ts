import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthGuard } from '@internal/dlq/admin-auth.guard';

describe('AdminAuthGuard', () => {
  let guard: AdminAuthGuard;
  let appConfig: { admin: { apiKey: string } };

  const mockContext = (headerValue?: string) => {
    const headers: Record<string, string> = {};
    if (headerValue !== undefined) {
      headers['x-admin-key'] = headerValue;
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as any;
  };

  beforeEach(() => {
    appConfig = { admin: { apiKey: '' } };
    guard = new AdminAuthGuard(appConfig as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when ADMIN_API_KEY is empty', () => {
    it('denies all requests', () => {
      expect(() => guard.canActivate(mockContext())).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.canActivate(mockContext('anything'))).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('when ADMIN_API_KEY is set', () => {
    it('allows requests with matching header', () => {
      appConfig.admin.apiKey = 'secret123';

      expect(guard.canActivate(mockContext('secret123'))).toBe(true);
    });

    it('throws UnauthorizedException when header is missing', () => {
      appConfig.admin.apiKey = 'secret123';
      expect(() => guard.canActivate(mockContext())).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when header does not match', () => {
      appConfig.admin.apiKey = 'secret123';

      expect(() => guard.canActivate(mockContext('wrong-key'))).toThrow(
        UnauthorizedException,
      );
    });
  });
});
