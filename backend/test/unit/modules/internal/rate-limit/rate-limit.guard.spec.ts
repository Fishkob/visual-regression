import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { AppConfigService } from '@config/app-config.service';
import { METRICS } from '@common/domain/metrics-catalog';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { RateLimitService } from '@internal/rate-limit/rate-limit.service';
import { RateLimitGuard } from '@internal/rate-limit/rate-limit.guard';
import { createMock } from '@test/utils/create-mock';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let mockRateLimit: Mocked<RateLimitService>;
  let mockMetrics: Mocked<IMetricsRecorder>;
  let mockReflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

  const appConfig = {
    uploadRateLimitPerMinute: 60,
    loginRateLimitPerMinute: 5,
    logRateLimitPerMinute: 100,
  };

  const makeContext = (
    request: Record<string, unknown>,
    scope: string | undefined,
  ) => {
    mockReflector.getAllAndOverride.mockReturnValue(scope);
    const response = { setHeader: vi.fn() };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<RateLimitGuard['canActivate']>[0];
    return { context, response };
  };

  beforeEach(async () => {
    mockRateLimit = createMock<RateLimitService>();
    mockMetrics = createMock<IMetricsRecorder>();
    mockReflector = { getAllAndOverride: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: AppConfigService, useValue: appConfig },
        { provide: RateLimitService, useValue: mockRateLimit },
        { provide: METRICS_RECORDER, useValue: mockMetrics },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get(RateLimitGuard);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes through when the handler has no @RateLimit metadata', async () => {
    const { context } = makeContext({ ip: '203.0.113.9' }, undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).not.toHaveBeenCalled();
  });

  it('skips when the scope limit is disabled (0)', async () => {
    appConfig.uploadRateLimitPerMinute = 0;
    const { context } = makeContext(
      { auth: { username: 'ci', apiKeyId: 'k1' } },
      'upload',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).not.toHaveBeenCalled();

    appConfig.uploadRateLimitPerMinute = 60;
  });

  it('consumes the login bucket keyed by ip', async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: true, count: 2 });
    const { context } = makeContext({ ip: '203.0.113.9' }, 'login');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).toHaveBeenCalledWith(
      'login',
      'ip:203.0.113.9',
      5,
    );
  });

  it('consumes the log bucket keyed by ip', async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: true, count: 1 });
    const { context } = makeContext({ ip: '203.0.113.9' }, 'log');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).toHaveBeenCalledWith(
      'log',
      'ip:203.0.113.9',
      100,
    );
  });

  it('consumes the upload bucket keyed by api key', async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: true, count: 3 });
    const { context } = makeContext(
      { auth: { username: 'ci', apiKeyId: 'k1' } },
      'upload',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).toHaveBeenCalledWith(
      'upload',
      'apikey:k1',
      60,
    );
  });

  it('does not count a session upload without an apiKeyId', async () => {
    const { context } = makeContext({ auth: { username: 'alice' } }, 'upload');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).not.toHaveBeenCalled();
  });

  it('rejects with 429, Retry-After and a scope metric over the limit', async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: false, count: 61 });
    const { context, response } = makeContext(
      { auth: { username: 'ci', apiKeyId: 'k1' } },
      'upload',
    );

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.stringMatching(/^\d+$/),
    );
    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      METRICS.rateLimitedTotal,
      { scope: 'upload' },
    );
  });

  it('rejects an over-limit login with 429', async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: false, count: 6 });
    const { context } = makeContext({ ip: '203.0.113.9' }, 'login');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
