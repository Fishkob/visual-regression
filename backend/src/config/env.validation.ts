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

  MINIO_ENDPOINT: required,
  MINIO_PORT: Joi.number().default(9000),
  MINIO_ACCESS_KEY: required,
  MINIO_SECRET_KEY: required,
  MINIO_BUCKET: required,
  MINIO_PUBLIC_URL: requiredUrl,
  MINIO_USE_SSL: Joi.boolean().default(false),

  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),

  // Content Security Policy
  CSP_ENABLED: Joi.boolean()
    .default(false)
    .description(
      'Enable Content Security Policy headers. Disabled by default because MinIO cross-origin image delivery requires careful configuration.',
    ),

  /**
   * Application mode:
   * - 'api': Runs HTTP server for REST API
   * - 'worker': Runs comparison job poller for async image comparison
   */
  NODE_MODE: Joi.string().valid('api', 'worker').default('api'),

  // Job queue
  JOB_RETENTION_DAYS: Joi.number()
    .default(7)
    .description(
      'How many days to retain failed comparison jobs before cleanup.',
    ),

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

  // Throttling
  THROTTLE_TTL: Joi.number()
    .min(1)
    .default(60)
    .description('Time window in seconds for rate limiting.'),
  THROTTLE_LIMIT: Joi.number()
    .min(1)
    .default(1000)
    .description(
      'Max requests per TTL window. Increased from 100 to 1000 to accommodate CI pipelines uploading multiple screenshots concurrently.',
    ),

  // Metrics API key
  METRICS_API_KEY: Joi.string().default(''),

  // Admin API key (DLQ endpoints)
  ADMIN_API_KEY: Joi.string().default(''),

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
      'Max total attempts (not retries-on-top) for MinIO storage operations.',
    ),
  STORAGE_RETRY_DELAY_MS: Joi.number()
    .min(0)
    .default(1000)
    .description('Delay in ms between MinIO storage retries.'),

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
