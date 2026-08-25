# ADR 025: Authentication

## Status

Accepted — 2026-08-24

## Context

The product API previously required no authentication ("no auth" was documented
in the README). As the platform moves toward self-hosted deployments, unauthenticated
access to upload, comparison, and approval endpoints is unacceptable. The platform
serves two distinct caller classes:

- **Humans** via the web dashboard — need a persistent, low-friction session.
- **CI pipelines / scripted callers** — upload screenshots and must authenticate
  without interactive login. They cannot use a browser session.

The decision had to avoid external identity providers (the platform is self-hosted
in private networks and must not depend on an IdP), and the backend has a strong
preference for zero extra runtime dependencies (see ADR-001).

## Decision

Authenticate every endpoint through a single global guard, with two supported
credentials:

- **Session cookie (browser)** — `POST /auth/login` verifies the username/password
  and sets an opaque session token in an HttpOnly cookie. The token is a random
  value; only its SHA-256 hash is persisted (sessions table), keyed to a user and
  an expiry (`AUTH_SESSION_TTL_DAYS`, default 30). The cookie name is the hardcoded
  `SESSION_COOKIE` constant shared by the controller (write) and guard (read) so
  they can never drift; the `secure` flag comes from `AUTH_COOKIE_SECURE`.
- **API key (CI/scripts)** — `POST /api/v1/admin/api-keys` (guarded by the
  `x-admin-key` header holding `ADMIN_API_KEY`) creates a key. The raw key is 256
  bits of base64url entropy, shown once at creation; only its SHA-256 hash is
  persisted (unique `keyHash` column) and it can be revoked. Callers send it via
  the `x-api-key` header (name configurable via `AUTH_API_KEY_HEADER`).

### Global guard with opt-out

`AuthenticationGuard` is registered as a global `APP_GUARD`, so every endpoint is
protected by default. A request passes if it carries a valid, unexpired session
cookie OR a valid api key. Endpoints that must stay reachable are marked with the
`@Public()` decorator (`IS_PUBLIC_KEY` reflector): health, metrics, log ingestion,
`POST /auth/login` (login must be reachable without credentials), and the admin
endpoints (which carry their own `AdminAuthGuard`, see below).

### Env bootstrap

The first admin user is created on startup from
`BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` (only when both are set).
Passwords are hashed with scrypt (16-byte random salt, 64-byte derived key) via
`node:crypto` and verified with `timingSafeEqual`. The env vars are intended to be
removed after first login.

### Route-scoped throttles

- `default` — the global rate limit (`THROTTLE_TTL` / `THROTTLE_LIMIT`) applies to every route.
- `login` — caps `POST /auth/login` against brute force (`LOGIN_THROTTLE_LIMIT` / `LOGIN_THROTTLE_TTL`, default 5 / 60s).
- `log` — caps the public log-ingestion endpoint (`LOG_THROTTLE_LIMIT` / `LOG_THROTTLE_TTL`, default 100 / 60s).

The named throttlers are configured in `ThrottleConfigModule` from
`AppConfigService` (Joi-validated env) at module init; the `login`/`log`
throttlers are scoped to their own handlers via `skipIf` while the `default`
throttler keeps covering all routes. The limits are read from DI rather than
from `process.env` at import time, so env-file values are honored by the actual
limiter (decorator metadata would be evaluated before ConfigModule loads the
env files).

All throttles are tracked per IP via `req.ip`. Behind the documented reverse
proxy (nginx in `docker-compose`/Helm ingress), Express must be told to trust
`X-Forwarded-For` or every client shares the proxy's IP and the per-IP budgets
(login brute-force guard especially) collapse into a shared limit. Set
`TRUST_PROXY=true` in the backend env behind a proxy; keep it `false` when the
backend is directly reachable. The switch is applied in `bootstrapApi()`
(`app.set('trust proxy', appConfig.trustProxy)`).

### Admin endpoints

`POST /admin/api-keys` and `admin/dlq` are marked `@Public()` with respect to the
global `AuthenticationGuard` and are protected solely by the `AdminAuthGuard`
(`x-admin-key` header holding `ADMIN_API_KEY`). These operational endpoints are
deliberately outside the product API surface — the design spec scopes them as
"narrower than the global guard, not part of the product API surface". In
particular, `POST /admin/api-keys` must be reachable with only the admin key:
requiring a product credential there would make the first product API key
impossible to provision (bootstrap dead end).

## Rationale

- **Zero dependencies** — password hashing (scrypt), token hashing (SHA-256), and
  random key generation all come from `node:crypto`. No bcrypt/argon2, no JWT
  library, no session store, no IdP integration to maintain.
- **SHA-256 for tokens, scrypt for passwords** — a session token / api key is 256
  bits of entropy, so a fast hash is adequate (the secret is never a guessable
  low-entropy input). Passwords are low-entropy, so they get a slow, salted KDF.
- **Global guard** — the default-deny posture means a new endpoint cannot be
  added unprotected by accident; public endpoints are the explicit exception.
- **DB-backed keys** — keys can be revoked and are cheap to create; the raw key is
  never persisted, so a DB leak exposes only hashes.

## Alternatives Considered

- **JWT (stateless)** — no server-side revocation or expiry control without extra
  machinery; signing keys must be managed. Rejected in favor of DB-backed sessions
  and keys, which the platform already has the schema for.
- **External IdP / OAuth2** — heavyweight for a self-hosted tool and adds an
  external runtime dependency.
- **Per-endpoint guards instead of a global guard** — easy to forget a new
  endpoint. Rejected in favor of global default-deny.

## Consequences

- All product API requests now need either a session cookie or an api key; CI
  callers must create a key and send `x-api-key`. Seed scripts read `SEED_API_KEY`
  (or `E2E_API_KEY` for the CI e2e seeder) and attach the header to every request.
- A `Session` and `ApiKey` Prisma model were added (mapped via `@@map` to the
  Postgres tables `"Session"`/`"ApiKey"`, see the auth migration); existing
  deployments must run migrations.
- Health, metrics, and log endpoints remain public by design; anything else is
  guarded.
- **@nestjs/throttler v6 expects ttl in milliseconds**, while env vars are written
  in seconds. The conversion (`* 1000`) happens at the config boundary
  (`app-config.service.ts` and `throttle-limits.ts`); a value copied verbatim from
  env into the throttler would silently become a much longer window.
