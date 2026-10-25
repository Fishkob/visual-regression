import * as Joi from 'joi';
import { UPLOAD_HARD_LIMIT_MB } from '@config/upload-limits';

// Swagger export only reads decorators and doesn't need real infra.
// process.argv is available before any module code runs, so we can
// auto-detect and loosen validation without external env vars.
const isSwaggerExport = process.argv[1]?.includes('swagger-export');

const required = isSwaggerExport
  ? Joi.string().default('dummy')
  : Joi.string().required();

const requiredUrl = isSwaggerExport
  ? Joi.string().default('http://localhost:9000/dummy')
  : Joi.string().uri().required();

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  DATABASE_URL: requiredUrl,

  RUSTFS_ENDPOINT: required,
  RUSTFS_PORT: Joi.number().default(9000),
  RUSTFS_ACCESS_KEY: required,
  RUSTFS_SECRET_KEY: required,
  RUSTFS_BUCKET: required,
  RUSTFS_PUBLIC_URL: requiredUrl,
  RUSTFS_USE_SSL: Joi.boolean().default(false),
  RUSTFS_SIGNED_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(604800)
    .default(3600)
    .description(
      'Lifetime of the presigned URLs the API returns for screenshots and rendered PDF pages. SigV4 caps this at seven days (604800).',
    ),
  RUSTFS_ENSURE_PUBLIC_BUCKET: Joi.boolean()
    .default(false)
    .description(
      'Set an anonymous read (s3:GetObject) bucket policy on startup. Off by default: the API returns time-limited presigned URLs, so a public-read bucket is not required. Enable only if an external consumer fetches screenshots without credentials.',
    ),

  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),

  // Content Security Policy
  CSP_ENABLED: Joi.boolean()
    .default(false)
    .description(
      'Enable Content Security Policy headers. Disabled by default because RustFS cross-origin image delivery requires careful configuration.',
    ),

  /**
   * Application mode:
   * - 'api': Runs HTTP server for REST API
   * - 'worker': Runs comparison job poller for async image comparison
   */
  NODE_MODE: Joi.string().valid('api', 'worker').default('api'),

  // Job queue
  RUN_HISTORY_RETENTION_DAYS: Joi.number()
    .integer()
    .min(1)
    .default(365)
    .description(
      'Default days to keep finished runs (per-project overrides win)',
    ),
  JOB_RETENTION_DAYS: Joi.number()
    .default(7)
    .description(
      'How many days to retain failed comparison jobs before cleanup.',
    ),

  // Baseline history
  BASELINE_HISTORY_LIMIT: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .description(
      'How many replaced baselines to keep per test variant (newest first).',
    ),

  // Public frontend base used to build dashboard links in webhook payloads.
  APP_PUBLIC_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost')
    .description('Browser-reachable base URL of the dashboard.'),

  // App
  PORT: Joi.number().default(3000),

  // Max upload size (MB) for PNG screenshots
  SCREENSHOT_MAX_SIZE_MB: Joi.number()
    .default(UPLOAD_HARD_LIMIT_MB)
    .max(UPLOAD_HARD_LIMIT_MB)
    .description('Maximum PNG upload size in megabytes.'),

  // Max request body size (MB) for JSON payloads
  MAX_BODY_SIZE_MB: Joi.number()
    .default(10)
    .description('Maximum JSON request body size in megabytes.'),

  // Rate limits — every rule is a fixed one-minute window expressed as
  // "requests per minute" for its scope; 0 disables the rule.
  UPLOAD_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(60)
    .description('Max upload requests per minute per API key'),
  LOGIN_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(5)
    .description('Max login attempts per minute per IP'),
  LOG_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(100)
    .description('Max log-ingestion requests per minute per IP'),

  // Reverse proxy trust
  TRUST_PROXY: Joi.boolean()
    .default(false)
    .description(
      'Trust X-Forwarded-For headers from the reverse proxy (nginx/ingress). Required for correct per-IP rate limiting of the login and log endpoints and client-IP logging behind a proxy. Disable when the app is directly reachable.',
    ),

  // Auth
  // Note: the session cookie NAME is deliberately NOT configurable — it is the
  // hardcoded SESSION_COOKIE constant so the controller (write) and guard
  // (read) can never drift.
  AUTH_SESSION_TTL_DAYS: Joi.number().min(1).default(30),
  AUTH_COOKIE_SECURE: Joi.boolean().default(false),
  AUTH_API_KEY_HEADER: Joi.string().default('x-api-key'),
  BOOTSTRAP_ADMIN_USERNAME: Joi.string().allow('').default(''),
  BOOTSTRAP_ADMIN_PASSWORD: Joi.string().allow('').default(''),

  // Metrics API key (empty disables the metrics endpoint per metrics-auth.guard)
  METRICS_API_KEY: Joi.string().allow('').default(''),

  // Admin API key (DLQ endpoints) — empty disables the admin endpoints
  // per admin-auth.guard; docker-compose injects it as "" when unset.
  ADMIN_API_KEY: Joi.string().allow('').default(''),

  // Metrics
  METRICS_ENABLED: Joi.boolean().default(true),

  // PDF sidecar
  PDF_SIDECAR_URL: Joi.string()
    .default('http://pdf-sidecar:3001')
    .description('Base URL for PDF sidecar compare endpoint'),
  PDF_SIDECAR_TIMEOUT: Joi.number()
    .default(30_000)
    .description('Timeout in ms for PDF sidecar compare requests'),
  PDF_SIDECAR_HEALTH_URL: Joi.string().description(
    'URL for PDF sidecar health endpoint',
  ),

  // Storage retry
  STORAGE_MAX_ATTEMPTS: Joi.number()
    .min(1)
    .max(10)
    .default(3)
    .description(
      'Max total attempts (not retries-on-top) for RustFS storage operations.',
    ),
  STORAGE_RETRY_DELAY_MS: Joi.number()
    .min(0)
    .default(1000)
    .description('Delay in ms between RustFS storage retries.'),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('debug')
    .description('Pino log level.'),

  // Worker health
  WORKER_HEALTH_URL: Joi.string().description('URL for worker health endpoint'),
  WORKER_HEALTH_PORT: Joi.number()
    .default(3003)
    .description('Port for worker health server'),

  // Build/deploy metadata
  APP_VERSION: Joi.string().default('dev'),
  GIT_COMMIT: Joi.string().default('unknown'),
  BUILD_TIME: Joi.string().default('unknown'),

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().allow('').default(''),

  // Swagger export
  SWAGGER_BASE_URL: Joi.string().default('http://localhost:3000'),
});
