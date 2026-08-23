import { UnauthorizedException } from '@nestjs/common';
import { MetricsAuthGuard } from '@internal/metrics/metrics-auth.guard';

describe('MetricsAuthGuard', () => {
  let guard: MetricsAuthGuard;
  let appConfig: { metrics: { apiKey: string; enabled: boolean } };

  const mockContext = (headerValue?: string) => {
    const headers: Record<string, string> = {};
    if (headerValue !== undefined) {
      headers['x-metrics-key'] = headerValue;
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as any;
  };

  beforeEach(() => {
    appConfig = { metrics: { apiKey: '', enabled: true } };
    guard = new MetricsAuthGuard(appConfig as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when METRICS_API_KEY is empty', () => {
    it('denies all requests', () => {
      expect(() => guard.canActivate(mockContext())).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.canActivate(mockContext('anything'))).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('when METRICS_API_KEY is set', () => {
    it('allows requests with matching header', () => {
      appConfig.metrics.apiKey = 'secret123';

      expect(guard.canActivate(mockContext('secret123'))).toBe(true);
    });

    it('throws UnauthorizedException when header is missing', () => {
      appConfig.metrics.apiKey = 'secret123';
      expect(() => guard.canActivate(mockContext())).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when header does not match', () => {
      appConfig.metrics.apiKey = 'secret123';

      expect(() => guard.canActivate(mockContext('wrong-key'))).toThrow(
        UnauthorizedException,
      );
    });
  });
});
