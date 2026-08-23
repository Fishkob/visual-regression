import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '@config/app-config.service';

function buildAppConfig(values: Record<string, unknown>): AppConfigService {
  return new AppConfigService(new ConfigService(values));
}

describe('AppConfigService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseValues: Record<string, unknown> = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
    RUSTFS_ENDPOINT: 'localhost',
    RUSTFS_PORT: 9000,
    RUSTFS_USE_SSL: 'false',
    RUSTFS_ACCESS_KEY: 'test-key',
    RUSTFS_SECRET_KEY: 'test-secret',
    RUSTFS_BUCKET: 'visual-tests',
    RUSTFS_PUBLIC_URL: 'http://localhost:9000',
    PDF_SIDECAR_URL: 'http://pdf-sidecar:3001',
    PDF_SIDECAR_TIMEOUT: 30_000,
    JOB_RETENTION_DAYS: 7,
    WORKER_HEALTH_URL: 'http://worker:3002',
    WORKER_HEALTH_PORT: 3003,
    METRICS_ENABLED: true,
    METRICS_API_KEY: 'secret123',
    ADMIN_API_KEY: 'admin-secret',
    THROTTLE_TTL: 60,
    THROTTLE_LIMIT: 1000,
    LOG_LEVEL: 'info',
    APP_VERSION: '1.2.3',
    GIT_COMMIT: 'abc123',
    BUILD_TIME: '2024-01-01T00:00:00Z',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4317',
    SWAGGER_BASE_URL: 'http://localhost:3000',
    CSP_ENABLED: true,
    CORS_ORIGIN: 'http://localhost:5173',
  };

  it('exposes the database url', () => {
    const config = buildAppConfig(baseValues);
    expect(config.database.url).toBe(
      'postgresql://user:pass@localhost:5432/vrt',
    );
  });

  it('exposes the rustfs group with coerced port and ssl', () => {
    const config = buildAppConfig(baseValues);
    expect(config.rustfs.endpoint).toBe('localhost');
    expect(config.rustfs.port).toBe(9000);
    expect(config.rustfs.useSsl).toBe(false);
    expect(config.rustfs.accessKey).toBe('test-key');
    expect(config.rustfs.secretKey).toBe('test-secret');
    expect(config.rustfs.bucket).toBe('visual-tests');
    expect(config.rustfs.publicUrl).toBe('http://localhost:9000');
  });

  it('coerces RUSTFS_USE_SSL when it arrives as a string', () => {
    const config = buildAppConfig({ ...baseValues, RUSTFS_USE_SSL: 'true' });
    expect(config.rustfs.useSsl).toBe(true);
  });

  it('coerces RUSTFS_USE_SSL when it arrives as a boolean', () => {
    const config = buildAppConfig({ ...baseValues, RUSTFS_USE_SSL: true });
    expect(config.rustfs.useSsl).toBe(true);
  });

  it('exposes the pdf sidecar group', () => {
    const config = buildAppConfig(baseValues);
    expect(config.pdfSidecar.url).toBe('http://pdf-sidecar:3001');
    expect(config.pdfSidecar.timeout).toBe(30_000);
    expect(config.pdfSidecar.healthUrl).toBeUndefined();
  });

  it('exposes the retention groups', () => {
    const config = buildAppConfig(baseValues);
    expect(config.jobRetention.days).toBe(7);
  });

  it('exposes the worker health group', () => {
    const config = buildAppConfig(baseValues);
    expect(config.workerHealth.url).toBe('http://worker:3002');
    expect(config.workerHealth.port).toBe(3003);
  });

  it('exposes the metrics group', () => {
    const config = buildAppConfig(baseValues);
    expect(config.metrics.enabled).toBe(true);
    expect(config.metrics.apiKey).toBe('secret123');
  });

  it('disables metrics when METRICS_ENABLED is false', () => {
    const config = buildAppConfig({ ...baseValues, METRICS_ENABLED: false });
    expect(config.metrics.enabled).toBe(false);
  });

  it('treats a raw string "false" for METRICS_ENABLED as disabled (non-Joi path)', () => {
    const config = buildAppConfig({ ...baseValues, METRICS_ENABLED: 'false' });
    expect(config.metrics.enabled).toBe(false);
  });

  it('falls back to an empty otel endpoint when unset (pre-Joi path)', () => {
    const values = { ...baseValues };
    delete values.OTEL_EXPORTER_OTLP_ENDPOINT;
    const config = buildAppConfig(values);
    expect(config.otel.exporterEndpoint).toBe('');
  });

  it('exposes the admin api key', () => {
    const config = buildAppConfig(baseValues);
    expect(config.admin.apiKey).toBe('admin-secret');
  });

  it('exposes the throttle group', () => {
    const config = buildAppConfig(baseValues);
    expect(config.throttle.ttl).toBe(60);
    expect(config.throttle.limit).toBe(1000);
  });

  it('exposes the logging level', () => {
    const config = buildAppConfig(baseValues);
    expect(config.logging.level).toBe('info');
  });

  it('exposes the build metadata group', () => {
    const config = buildAppConfig(baseValues);
    expect(config.appVersion.version).toBe('1.2.3');
    expect(config.appVersion.gitCommit).toBe('abc123');
    expect(config.appVersion.buildTime).toBe('2024-01-01T00:00:00Z');
  });

  it('exposes the otel endpoint', () => {
    const config = buildAppConfig(baseValues);
    expect(config.otel.exporterEndpoint).toBe('http://otel:4317');
  });

  it('exposes the swagger base url', () => {
    const config = buildAppConfig(baseValues);
    expect(config.swagger.baseUrl).toBe('http://localhost:3000');
  });

  it('exposes the csp and cors groups', () => {
    const config = buildAppConfig(baseValues);
    expect(config.csp.enabled).toBe(true);
    expect(config.cors.origin).toBe('http://localhost:5173');
  });
});
