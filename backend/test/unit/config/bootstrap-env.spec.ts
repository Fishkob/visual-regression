import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadEnv, readBootstrapEnv } from '@config/bootstrap-env';

const REQUIRED_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
  RUSTFS_ENDPOINT: 'localhost',
  RUSTFS_ACCESS_KEY: 'test-key',
  RUSTFS_SECRET_KEY: 'test-secret',
  RUSTFS_BUCKET: 'visual-tests',
  RUSTFS_PUBLIC_URL: 'http://localhost:9000',
  TOTP_ENCRYPTION_KEY: 'a'.repeat(32),
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

describe('loadEnv', () => {
  const MANAGED_KEYS = ['VRT_ORDER', 'VRT_LOCAL_ONLY', 'VRT_PRESET'];
  const originalNodeEnv = process.env.NODE_ENV;

  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-env-'));
    MANAGED_KEYS.forEach((key) => Reflect.deleteProperty(process.env, key));
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
    MANAGED_KEYS.forEach((key) => Reflect.deleteProperty(process.env, key));
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('loads .env.local before .env', () => {
    fs.writeFileSync(path.join(cwd, '.env'), 'VRT_ORDER=from-env\n');
    fs.writeFileSync(
      path.join(cwd, '.env.local'),
      'VRT_ORDER=from-env-local\n',
    );

    expect(loadEnv(cwd)).toEqual([
      path.join(cwd, '.env.local'),
      path.join(cwd, '.env'),
    ]);
    expect(process.env.VRT_ORDER).toBe('from-env-local');
  });

  it('loads .env.local when .env is missing', () => {
    fs.writeFileSync(path.join(cwd, '.env.local'), 'VRT_LOCAL_ONLY=local\n');

    expect(loadEnv(cwd)).toEqual([path.join(cwd, '.env.local')]);
    expect(process.env.VRT_LOCAL_ONLY).toBe('local');
  });

  it('keeps variables already present in the process environment', () => {
    process.env.VRT_PRESET = 'from-process';
    fs.writeFileSync(path.join(cwd, '.env.local'), 'VRT_PRESET=from-file\n');

    loadEnv(cwd);

    expect(process.env.VRT_PRESET).toBe('from-process');
  });

  it('warns when no env file is present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadEnv(cwd)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('No env file found'),
    );
  });

  it('stays quiet in production', () => {
    process.env.NODE_ENV = 'production';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    loadEnv(cwd);

    expect(warn).not.toHaveBeenCalled();
  });
});
