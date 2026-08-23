import { envValidationSchema } from '@config/env.validation';

describe('Environment Validation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
});
