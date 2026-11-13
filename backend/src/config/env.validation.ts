import * as Joi from 'joi';
import { UPLOAD_HARD_LIMIT_MB } from '@config/upload-limits';
import {
  MAX_TREND_WINDOW_DAYS,
  OUTCOME_RETENTION_DEFAULT_DAYS,
} from '@common/domain/trend-window';

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

  DATABASE_POOL_MAX: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .description(
      'Max Postgres connections per process (API and worker each hold their own pool). Keep replicas x pool below the database max_connections.',
    ),

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
  BRANCH_RETENTION_DAYS: Joi.number()
    .integer()
    .min(0)
    .max(3650)
    .default(0)
    .description(
      'Default days without an upload before a non-default branch is deleted (0 disables the sweep; per-project overrides win)',
    ),
  JOB_RETENTION_DAYS: Joi.number()
    .default(7)
    .description(
      'How many days to retain failed comparison jobs before cleanup.',
    ),
  WEBHOOK_DELIVERY_RETENTION_DAYS: Joi.number()
    .integer()
    .min(1)
    .max(3650)
    .default(30)
    .description(
      'How many days to retain delivered/failed webhook payloads (they contain reviewer text).',
    ),
  AUDIT_RETENTION_DAYS: Joi.number()
    .integer()
    .min(0)
    .max(3650)
    .default(90)
    .description(
      'How many days to keep the audit trail (0 keeps it forever). Deleting audit rows is irreversible, so the window should never be shorter than the backup window it has to scope a restore from.',
    ),
  OUTCOME_RETENTION_DAYS: Joi.number()
    .integer()
    .min(0)
    .max(3650)
    .default(OUTCOME_RETENTION_DEFAULT_DAYS)
    .description(
      `How many days to keep the comparison outcome history the trends page reads (0 keeps it forever). The default (${OUTCOME_RETENTION_DEFAULT_DAYS}) is derived from the ${MAX_TREND_WINDOW_DAYS}-day window the trends endpoint serves, so it deletes only rows no read path can reach.`,
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
  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  // Max upload size (MB) for PNG screenshots
  SCREENSHOT_MAX_SIZE_MB: Joi.number()
    .min(1)
    .default(UPLOAD_HARD_LIMIT_MB)
    .max(UPLOAD_HARD_LIMIT_MB)
    .description('Maximum PNG upload size in megabytes.'),

  // Max request body size (MB) for JSON payloads
  MAX_BODY_SIZE_MB: Joi.number()
    .min(1)
    .max(100)
    .default(10)
    .description('Maximum JSON request body size in megabytes.'),

  // Rate limits — every rule is a fixed one-minute window expressed as
  // "requests per minute" for its scope; 0 disables the rule.
  UPLOAD_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(240)
    .description('Max upload requests per minute per API key'),
  LOGIN_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(10)
    .description('Max login attempts per minute per IP'),
  LOG_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(400)
    .description('Max log-ingestion requests per minute per IP'),
  // PDF page rendering writes render-cache objects that are deliberately not
  // charged to the project quota, so it is throttled per credential.
  RENDER_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(240)
    .description(
      'Max PDF page-render requests per minute per credential (render-cache writes are not quota-charged)',
    ),
  // Operator surfaces (/admin/api-keys, /admin/dlq) authenticate with a single
  // static key, so they get their own bucket instead of unlimited guessing.
  ADMIN_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(120)
    .description('Max admin-surface requests per minute per IP'),

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
  AUTH_SESSION_TTL_DAYS: Joi.number().integer().min(1).default(30),
  // Hard ceiling for a sliding session, measured from the session row's
  // createdAt. Without it a stolen cookie that is used once per TTL never
  // expires. Must be >= AUTH_SESSION_TTL_DAYS in practice; a lower value simply
  // caps every session earlier.
  AUTH_SESSION_ABSOLUTE_MAX_DAYS: Joi.number().integer().min(1).default(90),
  // Session cookies are the account takeover primitive when they travel in the
  // clear: a production default of `false` only ever fit the plain-HTTP
  // self-host that has to opt out explicitly anyway. `docker-compose.yml`
  // requires the value, so the bundled stack states its choice, and a
  // deployment that forgets it gets the safe one.
  AUTH_COOKIE_SECURE: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean().default(false),
  }),
  AUTH_API_KEY_HEADER: Joi.string()
    .min(1)
    .pattern(/^[A-Za-z0-9-]+$/)
    .default('x-api-key'),
  BOOTSTRAP_ADMIN_USERNAME: Joi.string().allow('').default(''),
  // The bootstrap admin is a full ADMIN account. Unset means "no bootstrap";
  // a configured value in production is a real credential and gets a floor.
  BOOTSTRAP_ADMIN_PASSWORD: Joi.string()
    .allow('')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().allow('').min(16),
      otherwise: Joi.string().allow(''),
    })
    .default(''),

  // Metrics API key (empty disables the metrics endpoint per metrics-auth.guard).
  // The operator keys are bearer credentials for privileged surfaces, so a
  // configured production value has a strength floor. Outside production the
  // length is free so local dev and e2e can keep using short fixtures.
  METRICS_API_KEY: Joi.string()
    .allow('')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().allow('').min(32),
      otherwise: Joi.string().allow(''),
    })
    .default(''),

  // Admin API key (DLQ endpoints) — empty disables the admin endpoints
  // per admin-auth.guard; docker-compose injects it as "" when unset.
  ADMIN_API_KEY: Joi.string()
    .allow('')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().allow('').min(32),
      otherwise: Joi.string().allow(''),
    })
    .default(''),

  // Metrics
  METRICS_ENABLED: Joi.boolean().default(true),

  // PDF sidecar
  PDF_SIDECAR_URL: Joi.string()
    .default('http://pdf-sidecar:3001')
    .description('Base URL for PDF sidecar compare endpoint'),
  PDF_SIDECAR_TIMEOUT: Joi.number()
    .integer()
    .min(1)
    .max(300_000)
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
  // `debug` logs every request URL; presigned screenshot URLs carry a live
  // signature in the query string, so a production container's log stream would
  // hold readable capability URLs. Debugging is an explicit opt-in there.
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().default('info'),
      otherwise: Joi.string().default('debug'),
    })
    .description('Pino log level.'),

  // Worker health
  WORKER_HEALTH_URL: Joi.string().description('URL for worker health endpoint'),
  WORKER_HEALTH_PORT: Joi.number()
    .integer()
    .min(1)
    .max(65535)
    .default(3003)
    .description('Port for worker health server'),

  // Build/deploy metadata
  APP_VERSION: Joi.string().default('dev'),
  GIT_COMMIT: Joi.string().default('unknown'),
  BUILD_TIME: Joi.string().default('unknown'),

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().allow('').default(''),

  // Swagger UI + OpenAPI document at /docs. Off in production unless enabled
  // explicitly: the document publishes every route, DTO and admin path.
  SWAGGER_ENABLED: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),

  // Swagger export
  SWAGGER_BASE_URL: Joi.string().default('http://localhost:3000'),
}).custom((env: Record<string, unknown>, helpers) => {
  const problem = productionProblem(env);
  if (problem) {
    return helpers.message({ custom: problem });
  }
  return env;
}, 'production safety rules');

// Values that exist in this repository (documentation, the local-dev example,
// the old dev-stack default). A production deployment that still carries one of
// them is not protected by it, whatever its length.
const DOCUMENTED_CREDENTIALS = new Set(['admin-secret']);

// The validated env is typed loosely on purpose (the schema owns the types), so
// every read narrows instead of stringifying whatever is there.
function envString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Rules the per-key schema cannot express. Each one is a silent
// misconfiguration on its own: startup succeeds, and a control that looks
// configured is weaker than it appears.
export function productionProblem(env: Record<string, unknown>): string | null {
  if (env.NODE_ENV !== 'production') return null;

  const bootstrapPassword = envString(env.BOOTSTRAP_ADMIN_PASSWORD);
  if (DOCUMENTED_CREDENTIALS.has(bootstrapPassword)) {
    return 'BOOTSTRAP_ADMIN_PASSWORD is a value published in this repository — the bootstrap admin is a full admin account';
  }

  // The metrics key guards a read-only surface and the admin key mints API keys.
  // One credential for both hands every metrics reader the admin surface.
  const metricsKey = envString(env.METRICS_API_KEY);
  const adminKey = envString(env.ADMIN_API_KEY);
  if (metricsKey && adminKey && metricsKey === adminKey) {
    return 'METRICS_API_KEY and ADMIN_API_KEY are the same value — they guard different surfaces, so they need different keys';
  }

  return null;
}
