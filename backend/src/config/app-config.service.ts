import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
@Injectable()
export class AppConfigService {
  constructor(private readonly config: NestConfigService) {}

  get app() {
    return {
      port: Number(this.config.get<string>('PORT')),
      env: this.config.get<string>('NODE_ENV'),
    };
  }

  get nodeMode(): 'api' | 'worker' {
    // main.ts constructs this service outside DI (before ConfigModule loads the
    // Joi-validated env), so the Joi default never applies there — default here.
    return (this.config.get<string>('NODE_MODE') ?? 'api') as 'api' | 'worker';
  }

  get screenshotMaxSize(): number {
    return (
      Number(this.config.get<string>('SCREENSHOT_MAX_SIZE_MB')) * 1024 * 1024
    );
  }

  get maxBodySize(): string {
    const mb = Number(this.config.get<string>('MAX_BODY_SIZE_MB'));
    return `${mb}mb`;
  }

  get storageRetry(): { maxAttempts: number; retryDelayMs: number } {
    return {
      maxAttempts: Number(this.config.get<string>('STORAGE_MAX_ATTEMPTS')),
      retryDelayMs: Number(this.config.get<string>('STORAGE_RETRY_DELAY_MS')),
    };
  }

  get database() {
    return { url: this.config.getOrThrow<string>('DATABASE_URL') };
  }

  get rustfs() {
    return {
      endpoint: this.config.getOrThrow<string>('RUSTFS_ENDPOINT'),
      port: Number(this.config.getOrThrow<number | string>('RUSTFS_PORT')),
      useSsl: this.rustfsUseSsl(
        this.config.getOrThrow<boolean | string>('RUSTFS_USE_SSL'),
      ),
      accessKey: this.config.getOrThrow<string>('RUSTFS_ACCESS_KEY'),
      secretKey: this.config.getOrThrow<string>('RUSTFS_SECRET_KEY'),
      bucket: this.config.getOrThrow<string>('RUSTFS_BUCKET'),
      publicUrl: this.config.getOrThrow<string>('RUSTFS_PUBLIC_URL'),
      // `!== false` so an unset value (Joi default true) leaves the policy
      // step enabled and only an explicit `false` turns it off.
      ensurePublicBucket:
        this.config.get<boolean>('RUSTFS_ENSURE_PUBLIC_BUCKET') !== false,
    };
  }

  get pdfSidecar() {
    return {
      url: this.config.getOrThrow<string>('PDF_SIDECAR_URL'),
      timeout: Number(this.config.getOrThrow<string>('PDF_SIDECAR_TIMEOUT')),
      healthUrl: this.config.get<string>('PDF_SIDECAR_HEALTH_URL'),
    };
  }

  get jobRetention() {
    return { days: this.config.getOrThrow<number>('JOB_RETENTION_DAYS') };
  }

  get workerHealth() {
    return {
      url: this.config.get<string>('WORKER_HEALTH_URL'),
      port: Number(this.config.getOrThrow<string>('WORKER_HEALTH_PORT')),
    };
  }

  get metrics() {
    return {
      // `=== true` (not `!== false`) so a raw string "false" from a non-Joi
      // path (pre-DI bootstrap, hand-built ConfigService) disables metrics
      // instead of accidentally enabling them.
      enabled: this.config.get<boolean>('METRICS_ENABLED') === true,
      apiKey: this.config.getOrThrow<string>('METRICS_API_KEY'),
    };
  }

  get admin() {
    return {
      apiKey: this.config.getOrThrow<string>('ADMIN_API_KEY'),
    };
  }

  get throttle() {
    return {
      ttl: parseInt(this.config.getOrThrow<string>('THROTTLE_TTL'), 10),
      limit: parseInt(this.config.getOrThrow<string>('THROTTLE_LIMIT'), 10),
    };
  }

  get logging() {
    return { level: this.config.get<string>('LOG_LEVEL') };
  }

  get appVersion() {
    return {
      version: this.config.getOrThrow<string>('APP_VERSION'),
      gitCommit: this.config.getOrThrow<string>('GIT_COMMIT'),
      buildTime: this.config.getOrThrow<string>('BUILD_TIME'),
    };
  }

  get otel() {
    return {
      // Match the Joi default('') so the pre-DI bootstrap reads the same value
      // as the validated seam when the endpoint is unset.
      exporterEndpoint:
        this.config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT') ?? '',
    };
  }

  get swagger() {
    return { baseUrl: this.config.getOrThrow<string>('SWAGGER_BASE_URL') };
  }

  get csp() {
    return { enabled: this.config.get<boolean>('CSP_ENABLED') };
  }

  get cors() {
    return { origin: this.config.get<string>('CORS_ORIGIN') };
  }

  private rustfsUseSsl(value: boolean | string): boolean {
    return typeof value === 'boolean' ? value : value === 'true';
  }
}
