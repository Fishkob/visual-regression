import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { AppConfigService } from '@config/app-config.service';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { UploadRateLimitService } from '@public/visualTest/intake/application/upload-rate-limit.service';
import { UploadRateLimitGuard } from '@public/visualTest/intake/presentation/guards/upload-rate-limit.guard';
import { createMock } from '@test/utils/create-mock';

describe('UploadRateLimitGuard', () => {
  let guard: UploadRateLimitGuard;
  let mockRateLimit: Mocked<UploadRateLimitService>;
  let mockMetrics: Mocked<IMetricsRecorder>;

  const appConfig = {
    uploadRateLimitPerMinute: 60,
  };

  const makeContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader: vi.fn() }),
      }),
    }) as unknown as Parameters<UploadRateLimitGuard['canActivate']>[0];

  beforeEach(async () => {
    mockRateLimit = createMock<UploadRateLimitService>();
    mockMetrics = createMock<IMetricsRecorder>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadRateLimitGuard,
        {
          provide: AppConfigService,
          useValue: appConfig as unknown as AppConfigService,
        },
        { provide: UploadRateLimitService, useValue: mockRateLimit },
        { provide: METRICS_RECORDER, useValue: mockMetrics },
      ],
    }).compile();

    guard = module.get(UploadRateLimitGuard);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows session-authenticated requests without a DB call', async () => {
    const context = makeContext({ auth: { username: 'alice' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).not.toHaveBeenCalled();
  });

  it('allows requests when the limit is disabled', async () => {
    const context = makeContext({
      auth: { username: 'ci', apiKeyId: 'k1' },
    });
    appConfig.uploadRateLimitPerMinute = 0;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).not.toHaveBeenCalled();

    appConfig.uploadRateLimitPerMinute = 60;
  });

  it('allows an api key under the limit', async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: true, count: 3 });
    const context = makeContext({
      auth: { username: 'ci', apiKeyId: 'k1' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).toHaveBeenCalledWith(
      'k1',
      expect.any(Date),
      60,
    );
  });

  it('rejects with 429 and Retry-After over the limit', async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: false, count: 61 });
    const response = { setHeader: vi.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ auth: { username: 'ci', apiKeyId: 'k1' } }),
        getResponse: () => response,
      }),
    } as unknown as Parameters<UploadRateLimitGuard['canActivate']>[0];

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.stringMatching(/^\d+$/),
    );
    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      expect.stringContaining('upload_rate_limited'),
      { key: 'ci' },
    );
  });
});
