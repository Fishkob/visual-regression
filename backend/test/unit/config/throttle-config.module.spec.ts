import type { ExecutionContext } from '@nestjs/common';
import { createThrottlerOptions } from '@config/throttle-config.module';
import { AppConfigService } from '@config/app-config.service';
import { AuthController } from '@internal/auth/auth.controller';
import { LogIngestionController } from '@/modules/internal/logging/log-ingestion.controller';

describe('createThrottlerOptions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const appConfig = {
    throttle: { ttlMs: 60_000, limit: 1000 },
    loginThrottle: { ttlMs: 60_000, limit: 5 },
    logThrottle: { ttlMs: 60_000, limit: 100 },
  } as unknown as AppConfigService;

  const contextFor = (
    controller: unknown,
    handler: unknown,
  ): ExecutionContext =>
    ({
      getClass: () => controller,
      getHandler: () => handler,
    }) as unknown as ExecutionContext;

  it('configures the three named throttlers from appConfig', () => {
    const { throttlers } = createThrottlerOptions(appConfig);

    expect(throttlers).toMatchObject([
      { name: 'default', ttl: 60_000, limit: 1000 },
      { name: 'login', ttl: 60_000, limit: 5 },
      { name: 'log', ttl: 60_000, limit: 100 },
    ]);
  });

  it('scopes the login throttle to AuthController.login', () => {
    const { throttlers } = createThrottlerOptions(appConfig);
    const login = throttlers.find((t) => t.name === 'login')!;

    expect(
      login.skipIf!(contextFor(AuthController, AuthController.prototype.login)),
    ).toBe(false);
    expect(
      login.skipIf!(
        contextFor(
          LogIngestionController,
          LogIngestionController.prototype.ingest,
        ),
      ),
    ).toBe(true);
  });

  it('scopes the log throttle to LogIngestionController.ingest', () => {
    const { throttlers } = createThrottlerOptions(appConfig);
    const log = throttlers.find((t) => t.name === 'log')!;

    expect(
      log.skipIf!(
        contextFor(
          LogIngestionController,
          LogIngestionController.prototype.ingest,
        ),
      ),
    ).toBe(false);
    expect(
      log.skipIf!(contextFor(AuthController, AuthController.prototype.login)),
    ).toBe(true);
  });

  it('never skips the default throttler', () => {
    const { throttlers } = createThrottlerOptions(appConfig);
    const def = throttlers.find((t) => t.name === 'default')!;

    expect(def.skipIf).toBeUndefined();
  });
});
