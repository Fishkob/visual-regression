# ADR 034: Auth Hardening (2FA, Sessions, CSRF)

## Status

Accepted — 2026-11-07

## Context

R9 gave humans roles and a password change, but a stolen password still grants
full access, a user cannot see or revoke other sessions, and session rows carry
only a token hash and expiry. There is no second factor, no way to log out
everywhere, and no explicit cross-site write check beyond `SameSite=Lax`.

OIDC/SAML is deliberately out of scope for a self-hosted single-tenant
deployment; email delivery (for reset/OTP) does not exist yet.

## Decision

**TOTP as the second factor, implemented with `node:crypto` (zero deps).**

- 6 digits, 30-second period, SHA-1, ±1 step skew. The secret is 20 random
  bytes, base32-encoded; the `otpauth://` URI is returned for QR rendering.
- `User.totpSecret` + `totpEnabledAt`: a secret is staged by `2fa/setup`, and
  only `2fa/enable` (verified code) sets `totpEnabledAt`, so an abandoned setup
  never changes login.
- Login with an enabled factor returns a short-lived challenge
  (`TwoFactorChallenge`, token stored hashed, 5-minute expiry, max 5 attempts)
  instead of a session cookie. `POST /auth/2fa/verify` exchanges it for a
  session after a TOTP or recovery code.
- 10 single-use recovery codes, formatted `XXXX-XXXX`, stored only as SHA-256
  hashes with `usedAt`; a replay fails. Codes are regenerated on every enable.
- Disabling requires the account password. The secret and recovery codes are
  cleared transactionally.

**Sessions are visible and revocable.**

- `Session` gains `lastSeenAt`, `ip`, `userAgent`, `revokedAt`. The guard
  rejects revoked rows and touches metadata at most once per five minutes.
- `GET /auth/sessions`, `DELETE /auth/sessions/:id` (own sessions only) and
  `POST /auth/sessions/revoke-all` (keeps the current session). Deactivation and
  password reset still delete every row.

**Hardening.**

- CSRF: session cookies remain `HttpOnly`, `SameSite=Lax`; every unsafe
  session-authenticated request is additionally rejected when
  `Sec-Fetch-Site: cross-site` or when `Origin` does not match `Host`.
  API-key callers are exempt (no ambient cookie).
- Password/2FA endpoints use the existing per-IP login rate-limit bucket
  (`@RateLimit('login')`), so brute force and recovery-code guessing are
  bounded. `AUTH_COOKIE_SECURE` must be true in production.
- TOTP secrets are stored in the database (not encrypted at rest in v1). The
  threat model is a database read; anyone with it already has password hashes
  and session tokens. Encrypting secrets would need a key-management story.

## Alternatives considered

- **Email OTP / magic links**: no SMTP in the deployment; a new dependency and
  deliverability burden.
- **WebAuthn/passkeys**: strong, but requires browser ceremony + credential
  storage; deferred until the deployment needs it.
- **JWT sessions**: would remove the session table and make "revoke all"
  impossible without a denylist; the DB-backed session stays.
- **CSRF tokens**: double-submit tokens add a second cookie/flow; the
  Origin/Sec-Fetch-Site check plus SameSite covers the self-hosted topology.
- **OIDC/SAML now**: trigger is a deployment that must use an external IdP or
  SCIM provisioning; record it here and keep password+TOTP for v1.

## Consequences

- A lost authenticator is recovered with a recovery code or an admin password
  reset; both are single-use/session-revoking.
- The session list exposes IP/user-agent to the account owner only.
- A reverse proxy must set `TRUST_PROXY=true` for meaningful session IPs and
  per-IP rate limits.
- Frontend login needs a second step when `twoFactorRequired` is returned; the
  session settings page owns 2FA setup/disable and session revocation.
