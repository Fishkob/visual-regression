# ADR 074: TOTP Two-Factor Authentication Is Removed

## Status

Accepted — 2026-11-08. Supersedes
[ADR-062](./ADR-062-totp-seeds-are-encrypted.md) entirely and the TOTP half of
[ADR-034](./ADR-034-auth-hardening.md); the session and CSRF decisions of
ADR-034 stand.

Enforced by the database migration that drops the two tables and the two `User`
columns (`20261124120000_remove_two_factor_auth`), by the absence of the
`/auth/2fa/*` routes from `backend/swagger.json`, and by the e2e suite, which has
no 2FA path left to drive.

Not enforced: nothing prevents a future change from re-introducing a second
factor. The decision is a product scope choice, not a technical constraint.

## Context

ADR-034 chose TOTP as the second factor for a self-hosted, single-tenant
deployment, and ADR-062 added at-rest encryption for the seed. Both were built
and shipped: setup, enable, disable, a five-minute login challenge, ten
single-use recovery codes, and a challenge rate limit.

Two things made the feature a net negative for this product:

- **It did not work as an account-recovery story.** The only documented way back
  into an account that lost both authenticator and recovery codes was an admin
  password reset, and `UsersService.resetPassword` never cleared `totpSecret` or
  `totpEnabledAt`. The reset revoked sessions and API keys and left the second
  factor standing, so the user stayed locked out.
- **The deployment does not need it.** The product is installed on one host by
  the team that uses it; there is no email delivery, no IdP, and no tenant
  boundary a stolen password would cross that the session and role model does
  not already contain. The operational cost — a required encryption key, a
  re-enrollment path on key rotation, a lockout class of support tickets —
  outweighed the marginal protection against a stolen password.

The alternative was to fix the gaps (admin reset, replay protection, a 2FA
policy) rather than remove the feature. That is a larger surface than the product
wants to own, and a partially supported second factor is worse than none: users
believe they are protected by a control nobody maintains.

## Decision

**Two-factor authentication is removed from the product. Password authentication
plus server-side sessions is the only login path.**

- The `POST /auth/login` answer is always the session `MeDto`. The
  `twoFactorRequired`/`challengeToken` variant, `POST /auth/2fa/verify`,
  `POST /auth/2fa/setup`, `POST /auth/2fa/enable` and `POST /auth/2fa/disable`
  are gone.
- `MeDto` no longer carries `totpEnabled`; the authenticated principal no longer
  carries it either, so no route can gate on it.
- The `TwoFactorChallenge` and `RecoveryCode` tables and the `User.totpSecret` /
  `User.totpEnabledAt` columns are dropped. The seed is credential material: it
  must not outlive the code that reads it, which is why the drop is part of the
  decision rather than a later cleanup.
- `TOTP_ENCRYPTION_KEY` is no longer read, validated, or documented. A
  deployment that still sets it is not rejected — an unused variable is not a
  reason to refuse to boot.
- Sessions, session revocation, `lastSeenAt`/IP/user-agent metadata, the
  `Origin`/`Sec-Fetch-Site` CSRF check and the login rate limit remain exactly as
  ADR-034 defined them. Removing the second factor did not remove the
  credential-revocation surface.
- The login rate-limit bucket is still applied to `login` and
  `change-password`. The `2fa/*` routes that shared it no longer exist.

## Consequences

- A lost password is the only way to lose access to an account, and an admin
  password reset is a complete recovery: it now restores a usable account
  because no second factor stands behind it.
- Accounts are protected by password strength, the scrypt cost factor, the
  per-IP login rate limit and session revocation on password change. A
  deployment that needs a second factor again has to reintroduce it (and then
  own the recovery path).
- The settings page keeps the session list and its revocation controls; the 2FA
  enrollment panel and the recovery-code dialog are gone.
- Operators can delete `TOTP_ENCRYPTION_KEY` from an existing `.env`; it is
  ignored. The migration drops the encrypted seeds with the columns.
- A backup restored into an older release still has the tables; that release's
  code would read a seed it can decrypt only if the key was kept. Restoring
  forward is the supported direction.
