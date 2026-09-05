# Rate-Limit Unification — Design

Date: 2026-09-05

## Problem

Rate limiting is hard to understand and operate. Three mechanisms coexist and
overlap:

1. **`@nestjs/throttler`** (in-memory, per IP) registered as a global
   `APP_GUARD` — a `default` flood guard (`THROTTLE_LIMIT`, e.g. 1000/min) on
   every route, plus route-scoped `login`/`log` named throttlers wired via
   `skipIf` in `throttle-config.module.ts`.
2. **A custom Postgres upload bucket** — `UploadRateLimitGuard` +
   `UploadRateLimitService` over the `ApiKeyRateLimitBucket` table, counting
   uploads per API key with an atomic `INSERT … ON CONFLICT … RETURNING`.
3. **`TRUST_PROXY`** — every IP-based rule collapses to the proxy IP behind a
   reverse proxy unless the operator remembers to set it.

The result: too many concepts and env knobs (`THROTTLE_TTL`/`THROTTLE_LIMIT`,
`LOGIN_THROTTLE_TTL`/`LOGIN_THROTTLE_LIMIT`, `LOG_THROTTLE_TTL`/
`LOG_THROTTLE_LIMIT`, `UPLOAD_RATE_LIMIT_PER_MINUTE`, `TRUST_PROXY`), a
hard-to-explain split ("browser uploads are not counted per-key; they stay under
the global throttle"), a TTL-seconds↔milliseconds conversion at the config
boundary, and a security-relevant `TRUST_PROXY` switch that silently changes
behavior for the whole API.

## Decision

**One concept: a rate-limit rule is a counter row in Postgres for a fixed
one-minute window, keyed by scope + identity. Over the limit → `429` with a
`Retry-After` header.**

`@nestjs/throttler` is removed entirely (global guard, `ThrottleConfigModule`,
`SkipThrottle` usages, TTL conversions, `throttle-limits.ts`). The existing
global per-IP flood guard on every route is dropped — authenticated product
traffic (lists, approvals, …) is deliberately not rate limited; this platform
runs in a private/trusted network and the meaningful abuse surfaces are uploads
(costly storage/compute) and anonymous endpoints (login brute force, log
ingestion).

Exactly three endpoints carry a limit:

| Scope    | Bucket key    | Limit env                      | Default |
| -------- | ------------- | ------------------------------ | ------- |
| `upload` | `apikey:<id>` | `UPLOAD_RATE_LIMIT_PER_MINUTE` | 60      |
| `login`  | `ip:<req.ip>` | `LOGIN_RATE_LIMIT_PER_MINUTE`  | 5       |
| `log`    | `ip:<req.ip>` | `LOG_RATE_LIMIT_PER_MINUTE`    | 100     |

All windows are fixed at one minute, so the TTL knobs disappear and every rule
is expressed as "N per minute". `0` disables the respective rule (as today for
uploads).

### Data model

`ApiKeyRateLimitBucket` (FK on `ApiKey`) is replaced by a generic table:

```prisma
model RateLimitBucket {
  id          String   @id @default(cuid())
  scope       String   // "login" | "log" | "upload"
  key         String   // login/log: "ip:<ip>", upload: "apikey:<id>"
  windowStart DateTime // minute-aligned
  count       Int      @default(0)
  createdAt   DateTime @default(now())
  @@unique([scope, key, windowStart])
  @@index([windowStart])
  @@map("RateLimitBucket")
}
```

The existing maintenance job that sweeps stale buckets (older than one day)
stays and points at the new table. Dropping the `ApiKey` FK means a revoked
key's buckets are no longer cascade-deleted; they age out via the same job —
acceptable for pure counter data.

### Guard order and wiring

The current global `ThrottlerGuard` (APP_GUARD #1) is replaced by a new
`RateLimitGuard` registered as a global APP_GUARD **after** the
`AuthenticationGuard`, so `request.auth` is populated when the guard runs. The
guard is a pass-through unless the handler carries a `@RateLimit(scope)`
decorator; exactly three handlers get it:

- `POST /auth/login` → `@RateLimit('login')`
- log-ingestion `ingest` handler → `@RateLimit('log')`
- `UploadController.upload` → `@RateLimit('upload')` (replaces
  `@UseGuards(UploadRateLimitGuard)`)

Scope determines both the bucket key (login/log → `req.ip`; upload →
`apikey:<apiKeyId>`) and which env limit applies. As today, an upload without an
`apiKeyId` (a session caller) is not counted — the frontend has no upload path.

### 429 behavior

Uniform across all scopes: atomically increment the counter, then if
`count > limit` respond `429` with the existing error body shape
(`{ statusCode, message, … }` via `AllExceptionsFilter`) and a `Retry-After`
header set to the seconds until the next minute boundary
(`retryAfterSeconds`). The existing window helpers (`computeWindowStart`,
`retryAfterSeconds`) move to common code and are reused.

### Config and env

| Old                                          | New                                       | Default |
| -------------------------------------------- | ----------------------------------------- | ------- |
| `THROTTLE_TTL`, `THROTTLE_LIMIT`             | removed                                   | —       |
| `LOGIN_THROTTLE_TTL`, `LOGIN_THROTTLE_LIMIT` | `LOGIN_RATE_LIMIT_PER_MINUTE`             | 5       |
| `LOG_THROTTLE_TTL`, `LOG_THROTTLE_LIMIT`     | `LOG_RATE_LIMIT_PER_MINUTE`               | 100     |
| `UPLOAD_RATE_LIMIT_PER_MINUTE`               | unchanged                                 | 60      |
| `TRUST_PROXY`                                | unchanged, now only affects `login`/`log` | `false` |

Joi schema (`env.validation.ts`) and `AppConfigService` getters are updated;
defaults move into the schema as constants (mirroring the current
`throttle-limits.ts` pattern, which is deleted). `TRUST_PROXY` semantics shrink
from "affects all per-IP throttling" to "affects the two IP-keyed anonymous
endpoints (login, log)" — the documented foot-gun shrinks accordingly.

### Metrics

`upload_rate_limited_total` is renamed to `rate_limited_total` with a `scope`
label (`login` | `log` | `upload`); the guard increments it with the scope of
the rejected rule. The cleanup gauge `cleanup_upload_rate_limit_buckets_deleted`
is renamed to `cleanup_rate_limit_buckets_deleted` to match the generic table.
No other code references these names (metrics-catalog is the single owner), so
the rename is contained.

### Code changes (backend)

- **Removed:** `@nestjs/throttler` dependency, `ThrottleConfigModule`,
  global `ThrottlerGuard` provider, `SkipThrottle` on health/metrics
  controllers, `UploadRateLimitGuard` (specific), throttle getters + TTL
  conversions in `AppConfigService`, `throttle-limits.ts`, `ApiKeyRateLimitBucket`
  Prisma model.
- **Generalized:** `UploadRateLimitService` → `RateLimitService`
  (`tryConsume(scope, key, limit)`, atomic upsert on the new table); window
  helpers move to common; `UploadRateLimitBucketCleanupTask` → new table.
- **New:** `@RateLimit(scope)` decorator + `RateLimitGuard`; config getters
  `loginRateLimitPerMinute` / `logRateLimitPerMinute`.
- **Kept:** cleanup job pattern, maintenance lock id (re-pointed), non-
  transaction-ambient write on the bare connection.

### Tests

- Unit: `RateLimitService`, `RateLimitGuard` (per-scope key derivation,
  pass-through without decorator, disabled-at-0), window helpers, env
  validation, config getters.
- E2E: the existing upload 429 spec is preserved; add login/log 429 coverage.
- E2E env (`vitest.config.e2e.ts`) migrates to the new names and keeps limits
  from tripping the suite (`LOGIN_RATE_LIMIT_PER_MINUTE: '1000'`, high
  `LOG_RATE_LIMIT_PER_MINUTE`, `UPLOAD_RATE_LIMIT_PER_MINUTE: '0'`), matching
  today's `LOGIN_THROTTLE_LIMIT: '1000'` + `UPLOAD_RATE_LIMIT_PER_MINUTE: '0'`.

### Docs and migration

- README env table + "Security Considerations": the two hard-to-follow bullets
  (per-key upload limit, reverse-proxy/per-IP throttling) are replaced by a
  short, uniform explanation.
- `.env.local.example`, `.env.staging.example`, `.env.production.example`,
  `.env.example`, `docker-compose.yml` (no throttle vars today beyond
  `TRUST_PROXY`), Helm `values.yaml`, `docs/deployment.md`, `docs/adr/025-...`
  updated; a new ADR records this change.
- **Breaking:** existing deployments must rename
  `LOGIN_THROTTLE_*`/`LOG_THROTTLE_*` → `*_RATE_LIMIT_PER_MINUTE` and drop
  `THROTTLE_TTL`/`THROTTLE_LIMIT`. Requires a Prisma migration for the new
  `RateLimitBucket` table (see ADR-024 migrate workflow).

## Non-goals

- No per-user or per-IP flood guard on the authenticated product API — the
  global `default` throttle is gone for good.
- No sliding-window / token-bucket algorithm — fixed one-minute windows stay.
- No Redis or new runtime dependency — Postgres buckets keep the limits
  cross-instance across backend replicas.
- No login throttle keyed by username — login stays IP-keyed exactly as today
  (per-IP is the reason `TRUST_PROXY` still exists).
