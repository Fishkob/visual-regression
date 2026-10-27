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
  they can never drift; the `secure` flag is set when `AUTH_COOKIE_SECURE` is
  true or the request itself arrived over TLS. An
  active session slides: once it is past half its TTL, each use extends it by a
  full TTL, so a session in continuous use never expires.
- **API key (CI/scripts)** — `POST /api/v1/admin/api-keys` (guarded by the
  `x-admin-key` header holding `ADMIN_API_KEY`) creates a key. The raw key is 256
  bits of base64url entropy, shown once at creation; only its SHA-256 hash is
  persisted (unique `keyHash` column) and it can be revoked. Callers send it via
  the `x-api-key` header (name configurable via `AUTH_API_KEY_HEADER`).

### Global guard with opt-out

`AuthenticationGuard` is registered as a global `APP_GUARD`, so every endpoint is
protected by default. A request passes if it carries a valid, unexpired session
cookie OR a valid api key. Endpoints that must stay reachable are marked with the
`@Public()` decorator (`IS_PUBLIC_KEY` reflector), and only three arguments
justify one: the credential cannot exist yet (the login pair — `POST /auth/login`
and its second step `POST /auth/2fa/verify`), the endpoint must work before anyone
is authenticated (health, log ingestion, resolving a share link by token), or the
route carries a different guard (the admin endpoints behind `AdminAuthGuard`, see
below; `/metrics`, whose `MetricsAuthGuard` demands the `x-metrics-key` header and
which is therefore not open). The decorators are the authoritative list; it is not
maintained here.

### Env bootstrap

The first admin user is created on startup from
`BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` (only when both are set
and no user exists yet — an installation that already has users is not touched).
Passwords are hashed with scrypt from `node:crypto` and verified with
`timingSafeEqual`. The env vars are intended to be removed after first login.

### Route-scoped rate limits

Rate limits are one-minute-window counters in Postgres, applied by the global
`RateLimitGuard` only where a `@RateLimit(scope)` decorator is present:

- `login` — caps `POST /auth/login` against brute force in two buckets, per IP
  and per IP+username: the coarse bucket stops password spraying across many
  usernames, the composite one stops a shared-NAT neighbour from exhausting
  another account's bucket.
- `log` — caps the public log-ingestion endpoint per IP.
- `upload` — caps uploads per API key.

A limit of `0` disables the rule. Because the counters live in Postgres, the
limits hold across backend replicas. `429` responses carry a `Retry-After`
header. The env names and defaults belong to
[the deployment docs](../deployment.md), not to this decision.

Only the anonymous rules (login, log) are keyed by `req.ip`; the login rule also
keys on the attempted username. Behind the documented reverse proxy (nginx in
`docker-compose`/Helm ingress), Express must be told to trust `X-Forwarded-For`
or every client shares the proxy's IP and the per-IP budgets collapse into a
shared limit. Set `TRUST_PROXY=true` in the backend env behind a proxy; keep it
`false` when the backend is directly reachable. The switch must be applied as a
hop count, not a boolean, because `true` would trust every appended
`X-Forwarded-For` entry and let a client spoof `req.ip`.

### Admin endpoints

`POST /admin/api-keys` and `admin/dlq` are marked `@Public()` with respect to the
global `AuthenticationGuard` and are protected solely by the `AdminAuthGuard`
(`x-admin-key` header holding `ADMIN_API_KEY`). These operational endpoints sit
deliberately outside the product API surface. In particular, the key-minting route
must be reachable with only the admin key: requiring a product credential there
would make the first product API key impossible to provision (bootstrap dead
end).

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
- Health and log endpoints remain public by design; `/metrics` sits outside the
  product credential but requires the metrics key. Anything else is guarded.
- `RateLimitGuard` is registered **after** `AuthenticationGuard`, so the `upload`
  rule can be keyed by the authenticated API key rather than `req.ip`; see
  ADR-026 for the unified one-minute-window counter design.

## Amendment — key management (2026-10-26)

Creating a key with a permanent `ADMIN_API_KEY` and then never being able to see
or revoke it turned the key lifecycle into a database chore. Key management is
now a product-API surface backed by the browser session:

- `GET /api-keys`, `POST /api-keys`, `POST /api-keys/:id/rotate`,
  `POST /api-keys/:id/revoke`, `DELETE /api-keys/:id` — all marked
  `@SessionOnly()`.
- **Session-only, not api-key, is the load-bearing part.** The global guard
  already knows which credential authenticated a request, so it rejects the api
  key path on these routes with `403`. A leaked CI key must not be able to mint,
  rotate, or revoke keys: that would escalate a scoped CI credential into
  platform-wide, permanent access. `POST /admin/api-keys` stays exactly as it was
  — it is the bootstrap door for the first key, before any session exists.
- Rotation creates the successor and retires the predecessor in one transaction.
  The predecessor can keep working for an optional grace window (bounded to 24
  hours) so a pipeline can be re-pointed without a window in which nothing
  authenticates; without a grace window it is revoked immediately.
- The successor's expiry is a three-way choice, not a default with an override:
  omitted inherits the predecessor's remaining lifetime (rotation must not turn
  an expiring key into a permanent one by accident), `null` grants a key that
  never expires, and a number sets that lifetime. `null` and "omitted" therefore
  cannot be collapsed into one "no value" — the DTO keeps them apart and the
  controller passes the field through untouched.
- Revocation is a soft delete (`revokedAt` + `revokedReason`) so the row survives
  as the audit trail for which CI job used which credential. An outright delete is
  allowed only for a key that never authenticated — after first use the row is the
  only record that exists.
- `lastUsedAt` is written at most once per hour per key: it is audit metadata, not
  a security control, and a write on every authenticated request would put a
  write on the hot path of every CI upload. A failed usage write is swallowed —
  auditing must never turn a valid key into a `500`.
- The OpenAPI document gains a `sessionCookie` scheme and these operations declare
  it instead of the document-wide `apiKeyAuth` requirement.
