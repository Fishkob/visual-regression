import { readBootstrapEnv } from '@config/bootstrap-env';

const REQUIRED_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
  RUSTFS_ENDPOINT: 'localhost',
  RUSTFS_ACCESS_KEY: 'test-key',
  RUSTFS_SECRET_KEY: 'test-secret',
  RUSTFS_BUCKET: 'visual-tests',
  RUSTFS_PUBLIC_URL: 'http://localhost:9000',
};

describe('readBootstrapEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults nodeMode to api', () => {
    expect(readBootstrapEnv({ ...REQUIRED_ENV }).nodeMode).toBe('api');
  });

  it('reads an explicit worker nodeMode', () => {
    expect(
      readBootstrapEnv({ ...REQUIRED_ENV, NODE_MODE: 'worker' }).nodeMode,
    ).toBe('worker');
  });

  it('defaults the otel endpoint to empty', () => {
    expect(readBootstrapEnv({ ...REQUIRED_ENV }).otelExporterEndpoint).toBe('');
  });

  it('reads an explicit otel endpoint', () => {
    expect(
      readBootstrapEnv({
        ...REQUIRED_ENV,
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4317',
      }).otelExporterEndpoint,
    ).toBe('http://otel:4317');
  });

  it('throws on missing required variables', () => {
    expect(() => readBootstrapEnv({})).toThrow(
      /Invalid environment configuration/,
    );
  });
});
