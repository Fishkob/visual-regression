import { envValidationSchema } from '@config/env.validation';

describe('Environment Validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts valid configuration', () => {
    const validEnv = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_PUBLIC_URL: 'localhost:4444',
      RUSTFS_PORT: 9000,
      RUSTFS_ACCESS_KEY: 'test-key',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_BUCKET: 'visual-tests',
      CORS_ORIGIN: 'cors',
      LOG_LEVEL: 'info',
      STORAGE_MAX_ATTEMPTS: 3,
      STORAGE_RETRY_DELAY_MS: 500,
    };

    const { error } = envValidationSchema.validate(validEnv, {
      abortEarly: false,
    });
    expect(error).toBeUndefined();
  });

  it('defaults the branch retention window to off and rejects a negative window', () => {
    const { error, value } = envValidationSchema.validate({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_ACCESS_KEY: 'test-key',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_BUCKET: 'visual-tests',
      RUSTFS_PUBLIC_URL: 'http://localhost:9000',
    });
    expect(error).toBeUndefined();
    expect(value.BRANCH_RETENTION_DAYS).toBe(0);

    const negative = envValidationSchema.validate({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_ACCESS_KEY: 'test-key',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_BUCKET: 'visual-tests',
      RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      BRANCH_RETENTION_DAYS: -1,
    });
    expect(negative.error?.message).toContain('BRANCH_RETENTION_DAYS');
  });

  it('rejects invalid LOG_LEVEL', () => {
    const invalidEnv = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_ACCESS_KEY: 'test-key',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_BUCKET: 'visual-tests',
      RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      LOG_LEVEL: 'super-verbose',
    };

    const { error } = envValidationSchema.validate(invalidEnv, {
      abortEarly: false,
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('LOG_LEVEL');
  });

  it('rejects STORAGE_MAX_ATTEMPTS of 0', () => {
    const invalidEnv = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_ACCESS_KEY: 'test-key',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_BUCKET: 'visual-tests',
      RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      STORAGE_MAX_ATTEMPTS: 0,
    };

    const { error } = envValidationSchema.validate(invalidEnv, {
      abortEarly: false,
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('STORAGE_MAX_ATTEMPTS');
  });

  it('rejects missing variables', () => {
    const invalidEnv = {
      RUSTFS_SECRET_KEY: 'test-secret',
    };

    const { error } = envValidationSchema.validate(invalidEnv, {
      abortEarly: false,
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('DATABASE_URL');
    expect(error?.message).toContain('RUSTFS_ACCESS_KEY');
  });

  it('defaults the build/deploy metadata keys', () => {
    const { value, error } = envValidationSchema.validate(
      {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
        RUSTFS_ENDPOINT: 'localhost',
        RUSTFS_ACCESS_KEY: 'test-key',
        RUSTFS_SECRET_KEY: 'test-secret',
        RUSTFS_BUCKET: 'visual-tests',
        RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.APP_VERSION).toBe('dev');
    expect(value.GIT_COMMIT).toBe('unknown');
    expect(value.BUILD_TIME).toBe('unknown');
  });

  it('defaults the OpenTelemetry endpoint to empty', () => {
    const { value, error } = envValidationSchema.validate(
      {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
        RUSTFS_ENDPOINT: 'localhost',
        RUSTFS_ACCESS_KEY: 'test-key',
        RUSTFS_SECRET_KEY: 'test-secret',
        RUSTFS_BUCKET: 'visual-tests',
        RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('');
  });

  it('defaults the Swagger base URL', () => {
    const { value, error } = envValidationSchema.validate(
      {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
        RUSTFS_ENDPOINT: 'localhost',
        RUSTFS_ACCESS_KEY: 'test-key',
        RUSTFS_SECRET_KEY: 'test-secret',
        RUSTFS_BUCKET: 'visual-tests',
        RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.SWAGGER_BASE_URL).toBe('http://localhost:3000');
  });

  it('defaults the per-minute rate-limit env vars', () => {
    const { value, error } = envValidationSchema.validate(
      {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
        RUSTFS_ENDPOINT: 'localhost',
        RUSTFS_ACCESS_KEY: 'test-key',
        RUSTFS_SECRET_KEY: 'test-secret',
        RUSTFS_BUCKET: 'visual-tests',
        RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.UPLOAD_RATE_LIMIT_PER_MINUTE).toBe(240);
    expect(value.LOGIN_RATE_LIMIT_PER_MINUTE).toBe(10);
    expect(value.LOG_RATE_LIMIT_PER_MINUTE).toBe(400);
    expect(value.RENDER_RATE_LIMIT_PER_MINUTE).toBe(240);
    expect(value.ADMIN_RATE_LIMIT_PER_MINUTE).toBe(120);
  });

  it('defaults TRUST_PROXY to false', () => {
    const { value, error } = envValidationSchema.validate(
      {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
        RUSTFS_ENDPOINT: 'localhost',
        RUSTFS_ACCESS_KEY: 'test-key',
        RUSTFS_SECRET_KEY: 'test-secret',
        RUSTFS_BUCKET: 'visual-tests',
        RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.TRUST_PROXY).toBe(false);
  });

  it('accepts an explicit TRUST_PROXY value', () => {
    const { value, error } = envValidationSchema.validate(
      {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
        RUSTFS_ENDPOINT: 'localhost',
        RUSTFS_ACCESS_KEY: 'test-key',
        RUSTFS_SECRET_KEY: 'test-secret',
        RUSTFS_BUCKET: 'visual-tests',
        RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        TRUST_PROXY: true,
      },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.TRUST_PROXY).toBe(true);
  });

  it('rejects a negative LOGIN_RATE_LIMIT_PER_MINUTE', () => {
    const { error } = envValidationSchema.validate(
      {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
        RUSTFS_ENDPOINT: 'localhost',
        RUSTFS_ACCESS_KEY: 'test-key',
        RUSTFS_SECRET_KEY: 'test-secret',
        RUSTFS_BUCKET: 'visual-tests',
        RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        LOGIN_RATE_LIMIT_PER_MINUTE: -1,
      },
      { abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error?.message).toContain('LOGIN_RATE_LIMIT_PER_MINUTE');
  });

  it('rejects an empty or malformed AUTH_API_KEY_HEADER', () => {
    const base = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_ACCESS_KEY: 'test-key',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_BUCKET: 'visual-tests',
      RUSTFS_PUBLIC_URL: 'http://localhost:9000',
    };

    for (const header of ['', 'x api key']) {
      const { error } = envValidationSchema.validate(
        { ...base, AUTH_API_KEY_HEADER: header },
        { abortEarly: false },
      );
      expect(error).toBeDefined();
      expect(error?.message).toContain('AUTH_API_KEY_HEADER');
    }

    const ok = envValidationSchema.validate(
      { ...base, AUTH_API_KEY_HEADER: 'x-custom-key' },
      { abortEarly: false },
    );
    expect(ok.error).toBeUndefined();
  });

  it('rejects a port outside 1-65535', () => {
    const { error } = envValidationSchema.validate(
      {
        ...{
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
          RUSTFS_ENDPOINT: 'localhost',
          RUSTFS_ACCESS_KEY: 'test-key',
          RUSTFS_SECRET_KEY: 'test-secret',
          RUSTFS_BUCKET: 'visual-tests',
          RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        },
        PORT: 70_000,
      },
      { abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error?.message).toContain('PORT');
  });

  it('rejects a zero body size', () => {
    const { error } = envValidationSchema.validate(
      {
        ...{
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
          RUSTFS_ENDPOINT: 'localhost',
          RUSTFS_ACCESS_KEY: 'test-key',
          RUSTFS_SECRET_KEY: 'test-secret',
          RUSTFS_BUCKET: 'visual-tests',
          RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        },
        MAX_BODY_SIZE_MB: 0,
      },
      { abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error?.message).toContain('MAX_BODY_SIZE_MB');
  });

  it('rejects an unbounded body size', () => {
    const { error } = envValidationSchema.validate(
      {
        ...{
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
          RUSTFS_ENDPOINT: 'localhost',
          RUSTFS_ACCESS_KEY: 'test-key',
          RUSTFS_SECRET_KEY: 'test-secret',
          RUSTFS_BUCKET: 'visual-tests',
          RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        },
        MAX_BODY_SIZE_MB: 1_000,
      },
      { abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error?.message).toContain('MAX_BODY_SIZE_MB');
  });

  it('rejects a zero screenshot size', () => {
    const { error } = envValidationSchema.validate(
      {
        ...{
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
          RUSTFS_ENDPOINT: 'localhost',
          RUSTFS_ACCESS_KEY: 'test-key',
          RUSTFS_SECRET_KEY: 'test-secret',
          RUSTFS_BUCKET: 'visual-tests',
          RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        },
        SCREENSHOT_MAX_SIZE_MB: 0,
      },
      { abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error?.message).toContain('SCREENSHOT_MAX_SIZE_MB');
  });

  it('rejects a short operator key in production but accepts it locally', () => {
    const base = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_ACCESS_KEY: 'test-key',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_BUCKET: 'visual-tests',
      RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      ADMIN_API_KEY: 'short',
      METRICS_API_KEY: 'short',
    };

    const production = envValidationSchema.validate(
      { ...base, NODE_ENV: 'production' },
      { abortEarly: false },
    );
    expect(production.error).toBeDefined();
    expect(production.error?.message).toContain('ADMIN_API_KEY');
    expect(production.error?.message).toContain('METRICS_API_KEY');

    const development = envValidationSchema.validate(
      { ...base, NODE_ENV: 'development' },
      { abortEarly: false },
    );
    expect(development.error).toBeUndefined();
  });

  it('defaults the absolute session lifetime to 90 days', () => {
    const { value, error } = envValidationSchema.validate(
      {
        ...{
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
          RUSTFS_ENDPOINT: 'localhost',
          RUSTFS_ACCESS_KEY: 'test-key',
          RUSTFS_SECRET_KEY: 'test-secret',
          RUSTFS_BUCKET: 'visual-tests',
          RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        },
        NODE_ENV: 'development',
      },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.AUTH_SESSION_ABSOLUTE_MAX_DAYS).toBe(90);
  });

  it('enables Swagger outside production', () => {
    const { value } = envValidationSchema.validate(
      {
        ...{
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
          RUSTFS_ENDPOINT: 'localhost',
          RUSTFS_ACCESS_KEY: 'test-key',
          RUSTFS_SECRET_KEY: 'test-secret',
          RUSTFS_BUCKET: 'visual-tests',
          RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        },
        NODE_ENV: 'development',
      },
      { abortEarly: false },
    );
    expect(value.SWAGGER_ENABLED).toBe(true);
  });

  it('disables Swagger in production by default', () => {
    const { value } = envValidationSchema.validate(
      {
        ...{
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
          RUSTFS_ENDPOINT: 'localhost',
          RUSTFS_ACCESS_KEY: 'test-key',
          RUSTFS_SECRET_KEY: 'test-secret',
          RUSTFS_BUCKET: 'visual-tests',
          RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        },
        NODE_ENV: 'production',
      },
      { abortEarly: false },
    );
    expect(value.SWAGGER_ENABLED).toBe(false);
  });

  it('keeps Swagger available in production when enabled explicitly', () => {
    const { value } = envValidationSchema.validate(
      {
        ...{
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
          RUSTFS_ENDPOINT: 'localhost',
          RUSTFS_ACCESS_KEY: 'test-key',
          RUSTFS_SECRET_KEY: 'test-secret',
          RUSTFS_BUCKET: 'visual-tests',
          RUSTFS_PUBLIC_URL: 'http://localhost:9000',
        },
        NODE_ENV: 'production',
        SWAGGER_ENABLED: true,
      },
      { abortEarly: false },
    );
    expect(value.SWAGGER_ENABLED).toBe(true);
  });

  // The production-safety rules below exist because each of these settings
  // looks configured while silently weakening a control.
  const productionBase = () => ({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/vrt',
    RUSTFS_ENDPOINT: 'localhost',
    RUSTFS_ACCESS_KEY: 'test-key',
    RUSTFS_SECRET_KEY: 'test-secret',
    RUSTFS_BUCKET: 'visual-tests',
    RUSTFS_PUBLIC_URL: 'http://localhost:9000',
    ADMIN_API_KEY: 'b'.repeat(32),
    METRICS_API_KEY: 'c'.repeat(32),
  });

  it('defaults the session cookie to secure in production', () => {
    const production = envValidationSchema.validate(productionBase(), {
      abortEarly: false,
    });
    expect(production.value.AUTH_COOKIE_SECURE).toBe(true);

    const development = envValidationSchema.validate(
      { ...productionBase(), NODE_ENV: 'development' },
      { abortEarly: false },
    );
    expect(development.value.AUTH_COOKIE_SECURE).toBe(false);
  });

  it('keeps an explicit plain-HTTP choice in production', () => {
    const { value, error } = envValidationSchema.validate(
      { ...productionBase(), AUTH_COOKIE_SECURE: false },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.AUTH_COOKIE_SECURE).toBe(false);
  });

  it('rejects credentials that are published in this repository', () => {
    const bootstrap = envValidationSchema.validate(
      { ...productionBase(), BOOTSTRAP_ADMIN_PASSWORD: 'admin-secret' },
      { abortEarly: false },
    );
    expect(bootstrap.error?.message).toContain('BOOTSTRAP_ADMIN_PASSWORD');
  });

  it('requires a full-length bootstrap admin password in production', () => {
    const tooShort = envValidationSchema.validate(
      { ...productionBase(), BOOTSTRAP_ADMIN_PASSWORD: 'short-pw' },
      { abortEarly: false },
    );
    expect(tooShort.error?.message).toContain('BOOTSTRAP_ADMIN_PASSWORD');

    const unset = envValidationSchema.validate(
      { ...productionBase(), BOOTSTRAP_ADMIN_PASSWORD: '' },
      { abortEarly: false },
    );
    expect(unset.error).toBeUndefined();
  });

  it('rejects one credential for both operator surfaces', () => {
    const { error } = envValidationSchema.validate(
      { ...productionBase(), METRICS_API_KEY: 'b'.repeat(32) },
      { abortEarly: false },
    );
    expect(error?.message).toContain('METRICS_API_KEY and ADMIN_API_KEY');
  });

  it('defaults LOG_LEVEL to info in production', () => {
    const production = envValidationSchema.validate(productionBase(), {
      abortEarly: false,
    });
    expect(production.value.LOG_LEVEL).toBe('info');

    const development = envValidationSchema.validate(
      { ...productionBase(), NODE_ENV: 'development' },
      { abortEarly: false },
    );
    expect(development.value.LOG_LEVEL).toBe('debug');
  });
});
