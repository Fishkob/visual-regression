import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

// The typed view of the validated environment. The object groups are built
// once, lazily, on first access and then reused: guards, pipes, and the logger
// factory read them on every request, and rebuilding them only churned garbage.
// Scalar getters deliberately stay uncached so a late ConfigService.set()
// (the e2e override seam) is still observed at read time.
interface AppConfigSnapshot {
  app: { port: number; env: string | undefined };
  storageRetry: { maxAttempts: number; retryDelayMs: number };
  database: { url: string; poolMax: number };
  rustfs: {
    endpoint: string;
    port: number;
    useSsl: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
    publicUrl: string;
    signedUrlTtlSeconds: number;
    ensurePublicBucket: boolean;
  };
  pdfSidecar: { url: string; timeout: number; healthUrl: string | undefined };
  jobRetention: { days: number };
  webhookRetention: { days: number };
  baselineHistory: { limit: number };
  retention: { runHistoryDays: number; branchRetentionDays: number };
  appPublicUrl: string;
  workerHealth: { url: string | undefined; port: number };
  metrics: { enabled: boolean; apiKey: string };
  admin: { apiKey: string };
  auth: {
    sessionTtlDays: number;
    sessionTtlMs: number;
    sessionAbsoluteMaxDays: number;
    sessionAbsoluteMaxMs: number;
    cookieSecure: boolean;
    apiKeyHeader: string | undefined;
    trustedHeader: string | undefined;
    bootstrapAdminUsername: string | undefined;
    bootstrapAdminPassword: string | undefined;
  };
  logging: { level: string | undefined };
  appVersion: { version: string; gitCommit: string; buildTime: string };
  otel: { exporterEndpoint: string };
  swagger: { baseUrl: string; enabled: boolean };
  csp: { enabled: boolean | undefined };
  cors: { origin: string | undefined };
}

@Injectable()
export class AppConfigService {
  private snapshot?: AppConfigSnapshot;

  constructor(private readonly config: NestConfigService) {}

  private get s(): AppConfigSnapshot {
    return (this.snapshot ??= this.buildSnapshot());
  }

  get app() {
    return this.s.app;
  }

  get nodeMode(): 'api' | 'worker' {
    // Kept live: the pre-DI bootstrap and tests may set NODE_MODE after the
    // Joi-validated env has been captured.
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
    return this.s.storageRetry;
  }

  get database() {
    return this.s.database;
  }

  get rustfs() {
    return this.s.rustfs;
  }

  get pdfSidecar() {
    return this.s.pdfSidecar;
  }

  get jobRetention() {
    return this.s.jobRetention;
  }

  get webhookRetention() {
    return this.s.webhookRetention;
  }

  get appPublicUrl() {
    return this.s.appPublicUrl;
  }

  get baselineHistory() {
    return this.s.baselineHistory;
  }

  get retention() {
    return this.s.retention;
  }

  get workerHealth() {
    return this.s.workerHealth;
  }

  get metrics() {
    return this.s.metrics;
  }

  get admin() {
    return this.s.admin;
  }

  get auth() {
    return this.s.auth;
  }

  get uploadRateLimitPerMinute(): number {
    return Number(this.config.get<string>('UPLOAD_RATE_LIMIT_PER_MINUTE'));
  }

  get loginRateLimitPerMinute(): number {
    return Number(this.config.get<string>('LOGIN_RATE_LIMIT_PER_MINUTE'));
  }

  get logRateLimitPerMinute(): number {
    return Number(this.config.get<string>('LOG_RATE_LIMIT_PER_MINUTE'));
  }

  get adminRateLimitPerMinute(): number {
    return Number(this.config.get<string>('ADMIN_RATE_LIMIT_PER_MINUTE'));
  }

  get renderRateLimitPerMinute(): number {
    return Number(this.config.get<string>('RENDER_RATE_LIMIT_PER_MINUTE'));
  }

  get logging() {
    return this.s.logging;
  }

  get appVersion() {
    return this.s.appVersion;
  }

  get otel() {
    return this.s.otel;
  }

  get swagger() {
    return this.s.swagger;
  }

  get trustProxy(): boolean {
    // `=== true` (not `!== false`) so a raw string from the pre-DI bootstrap
    // (hand-built ConfigService) never accidentally trusts the proxy.
    return this.config.get<boolean>('TRUST_PROXY') === true;
  }

  // Express's `trust proxy` is a hop count, not a boolean: `true` trusts every
  // X-Forwarded-For entry, so a client appends a fake address and spoofs
  // req.ip. Exactly one hop is the bundled nginx (or a single ingress).
  get trustProxyHops(): number | false {
    return this.trustProxy ? 1 : false;
  }

  get csp() {
    return this.s.csp;
  }

  get cors() {
    return this.s.cors;
  }

  private buildSnapshot(): AppConfigSnapshot {
    const sessionTtlDays = Number(
      this.config.get<string>('AUTH_SESSION_TTL_DAYS'),
    );
    const sessionAbsoluteMaxDays = Number(
      this.config.get<string>('AUTH_SESSION_ABSOLUTE_MAX_DAYS') ?? 90,
    );
    return {
      app: {
        port: Number(this.config.get<string>('PORT')),
        env: this.config.get<string>('NODE_ENV'),
      },
      storageRetry: {
        maxAttempts: Number(this.config.get<string>('STORAGE_MAX_ATTEMPTS')),
        retryDelayMs: Number(this.config.get<string>('STORAGE_RETRY_DELAY_MS')),
      },
      database: {
        url: this.config.getOrThrow<string>('DATABASE_URL'),
        // Falls back to the Joi default on the pre-Joi bootstrap path, like the
        // other non-critical settings.
        poolMax: this.config.get<number>('DATABASE_POOL_MAX') ?? 10,
      },
      rustfs: {
        endpoint: this.config.getOrThrow<string>('RUSTFS_ENDPOINT'),
        port: Number(this.config.getOrThrow<number | string>('RUSTFS_PORT')),
        useSsl: this.rustfsUseSsl(
          this.config.getOrThrow<boolean | string>('RUSTFS_USE_SSL'),
        ),
        accessKey: this.config.getOrThrow<string>('RUSTFS_ACCESS_KEY'),
        secretKey: this.config.getOrThrow<string>('RUSTFS_SECRET_KEY'),
        bucket: this.config.getOrThrow<string>('RUSTFS_BUCKET'),
        publicUrl: this.config.getOrThrow<string>('RUSTFS_PUBLIC_URL'),
        signedUrlTtlSeconds: Number(
          this.config.getOrThrow<number | string>(
            'RUSTFS_SIGNED_URL_TTL_SECONDS',
          ),
        ),
        // Off unless explicitly enabled: responses carry presigned URLs, so the
        // bucket no longer needs anonymous reads.
        ensurePublicBucket:
          this.config.get<boolean>('RUSTFS_ENSURE_PUBLIC_BUCKET') === true,
      },
      pdfSidecar: {
        url: this.config.getOrThrow<string>('PDF_SIDECAR_URL'),
        timeout: Number(this.config.getOrThrow<string>('PDF_SIDECAR_TIMEOUT')),
        healthUrl: this.config.get<string>('PDF_SIDECAR_HEALTH_URL'),
      },
      jobRetention: {
        days: this.config.getOrThrow<number>('JOB_RETENTION_DAYS'),
      },
      webhookRetention: {
        days: this.config.get<number>('WEBHOOK_DELIVERY_RETENTION_DAYS') ?? 30,
      },
      baselineHistory: {
        // Falls back to the Joi default on the pre-Joi bootstrap path, like the
        // other non-critical settings.
        limit: this.config.get<number>('BASELINE_HISTORY_LIMIT') ?? 10,
      },
      retention: {
        runHistoryDays:
          this.config.get<number>('RUN_HISTORY_RETENTION_DAYS') ?? 365,
        // 0 = disabled, the only retention window whose off-state is a value:
        // deleting branches is destructive, so a deployment opts in.
        branchRetentionDays:
          this.config.get<number>('BRANCH_RETENTION_DAYS') ?? 0,
      },
      appPublicUrl:
        this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost',
      workerHealth: {
        url: this.config.get<string>('WORKER_HEALTH_URL'),
        port: Number(this.config.getOrThrow<string>('WORKER_HEALTH_PORT')),
      },
      metrics: {
        // `=== true` (not `!== false`) so a raw string "false" from a non-Joi
        // path (pre-DI bootstrap, hand-built ConfigService) disables metrics
        // instead of accidentally enabling them.
        enabled: this.config.get<boolean>('METRICS_ENABLED') === true,
        apiKey: this.config.getOrThrow<string>('METRICS_API_KEY'),
      },
      admin: {
        apiKey: this.config.getOrThrow<string>('ADMIN_API_KEY'),
      },
      auth: {
        // sessionCookie name is the SESSION_COOKIE constant, not configurable
        sessionTtlDays,
        sessionTtlMs: sessionTtlDays * 24 * 60 * 60 * 1000,
        sessionAbsoluteMaxDays,
        sessionAbsoluteMaxMs: sessionAbsoluteMaxDays * 24 * 60 * 60 * 1000,
        cookieSecure: this.config.get<boolean>('AUTH_COOKIE_SECURE') === true,
        apiKeyHeader: this.config.get<string>('AUTH_API_KEY_HEADER'),
        trustedHeader: this.config.get<string>('AUTH_TRUSTED_HEADER'),
        bootstrapAdminUsername: this.config.get<string>(
          'BOOTSTRAP_ADMIN_USERNAME',
        ),
        bootstrapAdminPassword: this.config.get<string>(
          'BOOTSTRAP_ADMIN_PASSWORD',
        ),
      },
      logging: { level: this.config.get<string>('LOG_LEVEL') },
      appVersion: {
        version: this.config.getOrThrow<string>('APP_VERSION'),
        gitCommit: this.config.getOrThrow<string>('GIT_COMMIT'),
        buildTime: this.config.getOrThrow<string>('BUILD_TIME'),
      },
      otel: {
        // Match the Joi default('') so the pre-DI bootstrap reads the same
        // value as the validated seam when the endpoint is unset.
        exporterEndpoint:
          this.config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT') ?? '',
      },
      swagger: {
        baseUrl: this.config.getOrThrow<string>('SWAGGER_BASE_URL'),
        // Anything other than an explicit `false` keeps the docs available for
        // local/e2e use; the Joi schema already defaults it to false in
        // production.
        enabled: this.config.get<boolean>('SWAGGER_ENABLED') !== false,
      },
      csp: { enabled: this.config.get<boolean>('CSP_ENABLED') },
      cors: { origin: this.config.get<string>('CORS_ORIGIN') },
    };
  }

  private rustfsUseSsl(value: boolean | string): boolean {
    return typeof value === 'boolean' ? value : value === 'true';
  }
}
