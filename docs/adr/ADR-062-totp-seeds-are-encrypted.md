# ADR 062: TOTP seeds are encrypted at rest

## Status

Accepted — 2026-11-24.
Superseded by: ADR-074 (TOTP two-factor authentication is removed).

Enforced by `totp-secret-cipher.spec.ts` (round-trip, legacy passthrough,
fail-closed on a changed key or a tampered value) and by the auth service spec
(a legacy seed is re-encrypted after a successful login).

## Context

Every other long-lived credential is stored irreversibly: session tokens, API
keys, recovery codes and share tokens are hashes. The TOTP seed is the exception
because it has to be reversible — the server derives the next code from it.

Stored bare, a database dump, a `pg_dump` in a backup bucket, or a read-only
replica hands out every enrolled user's second factor for the lifetime of the
account. It also defeats the point of the 2FA control for the exact threat
(credential-store compromise) that makes it worth having.

## Decision

**`User.totpSecret` stores an AES-256-GCM ciphertext under
`TOTP_ENCRYPTION_KEY`.**

- The key is derived with SHA-256 from the required `TOTP_ENCRYPTION_KEY`
  environment variable (16+ characters; `openssl rand -hex 32` is the documented
  way). Compose refuses to start without it (`:?`), the Joi schema rejects a
  missing/short value, and install.sh generates it for a new installation.
- The stored form is `v1:<iv>:<tag>:<ciphertext>` (base64url, 12-byte IV). A
  value without the `v1:` prefix is a legacy plaintext seed: it is read as-is so
  an upgrade does not lock anyone out, and it is re-encrypted **after a
  successful TOTP login** through `AuthRepository.updateTotpSecret`, which — unlike
  `setTotpSecret` — does not clear `totpEnabledAt`.
- A malformed or undecryptable value throws. Authentication fails closed; it
  never reads as "this account has no second factor".
- The setup response still returns the plaintext secret once (that is what the
  user scans); only the stored column is encrypted.

## Consequences

- A database dump no longer yields usable second factors, and the seed no longer
  travels in a restorable form through backups.
- `TOTP_ENCRYPTION_KEY` becomes a required environment variable. An existing
  installation must add it before upgrading; seeds written before the upgrade
  keep working (legacy read) and are migrated on the next login.
- Rotating the key makes existing seeds undecryptable. That is deliberate: the
  alternative is a silent fallback that turns 2FA off. The operator re-enrolls
  TOTP (the key is documented as stable in `docs/deployment.md`).
- Losing the key is unrecoverable for TOTP (recovery codes still work until the
  user re-enrolls).
