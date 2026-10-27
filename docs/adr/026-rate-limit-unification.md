# ADR 026: Rate-Limit Unification

## Status

Accepted — 2026-09-05

## Context

Rate limiting previously mixed two mechanisms: `@nestjs/throttler` (in-memory,
per-IP) applied a `default` flood guard to every route plus route-scoped
`login`/`log` throttlers wired via `skipIf`, and a custom Postgres bucket
(`ApiKeyRateLimitBucket`) capped uploads per API key. Operators had to reason
about five env knobs, a TTL-seconds↔milliseconds conversion, a per-IP
`TRUST_PROXY` switch that silently affected the whole API, and an odd split
("browser uploads are not counted per-key"). See
`docs/superpowers/specs/2026-09-05-rate-limit-unification-design.md`.

## Decision

One uniform mechanism: a rate-limit rule is a counter row in Postgres for a
fixed one-minute window, keyed by `(scope, key)`. The generic `RateLimitBucket`
table replaces `ApiKeyRateLimitBucket`. A global `RateLimitGuard` (registered
after `AuthenticationGuard`) is a pass-through unless a handler carries
`@RateLimit(scope)`. The decorator sits on the abuse surfaces, not on product
traffic: upload, every credential-checking login/2FA entry point (`login`,
`2fa/verify`, `2fa/disable`, `change-password`), share-link resolve, and log
ingestion. Login-scope routes consume two buckets when a username is submitted
(`ip:<ip>` and `ip:<ip>:user:<username>`); upload consumes `apikey:<id>` for
API-key traffic and `session:<username>` for session traffic (the IP when no
username is known); log ingestion and share-link resolve consume `ip:<ip>`.

- `@nestjs/throttler`, the global `default` flood guard, the `skipIf`
  machinery, and the TTL knobs are removed. Authenticated product traffic
  (lists, approvals) is deliberately not rate limited in this private/trusted
  network; the meaningful abuse surfaces are uploads and the anonymous
  endpoints.
- Env collapses to `UPLOAD_RATE_LIMIT_PER_MINUTE`, `LOGIN_RATE_LIMIT_PER_MINUTE`,
  `LOG_RATE_LIMIT_PER_MINUTE` (all "per minute", `0` disables) and
  `TRUST_PROXY`.
- `TRUST_PROXY` now affects only the rules keyed by `ip:<ip>` — the login-scope
  routes (the anonymous login/2FA/share-link ones among them) and log ingestion
  — shrinking its blast radius.
- The 429 metric is generalized to `rate_limited_total` with a `scope` label.

## Consequences

- Counters persist across backend replicas for every rule (previously only the
  upload rule did).
- Each rate-limited request performs one atomic `INSERT ... ON CONFLICT`
  write; non-limited routes touch the DB only as before.
- **Breaking:** existing deployments must rename `LOGIN_THROTTLE_*` /
  `LOG_THROTTLE_*` to `LOGIN_RATE_LIMIT_PER_MINUTE` / `LOG_RATE_LIMIT_PER_MINUTE`,
  drop `THROTTLE_TTL` / `THROTTLE_LIMIT`, and run the `RateLimitBucket`
  migration (see ADR-024).
- `@nestjs/throttler` is removed from dependencies.
- The `x-admin-key`-guarded admin endpoints (`admin/api-keys`, `admin/dlq`) and the rest of the authenticated product API carry no per-IP rate limit — the design deliberately drops the global flood guard in this private/trusted-network deployment.
