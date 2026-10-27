# ADR 038: Read-Only Share Links

## Status

Accepted — 2026-10-25

## Context

Stakeholders (design, product, clients) need to see a project, a test or a run
without an account. The existing API is authenticated; making an endpoint public
would expose every project. Links must be expiring, revocable, optionally
protected and auditable, and they must never allow approval or deletion.

## Decision

- **Opaque bearer token, stored hashed.** A 256-bit random token is shown once
  at creation and only its SHA-256 hash is stored (same rule as API keys and
  sessions). Links are therefore revocable — a signed JWT would stay valid until
  expiry with no server-side kill switch.
- **Scope is one of `PROJECT`, `TEST`, `RUN`**, with the project name and the
  optional test/branch/run key denormalized onto the row. Names are validated at
  creation; a later rename/deletion makes the public read a `404` rather than
  leaking a different target. `TEST`/`RUN` resolve the branch (and thereby the
  project) on every read; `PROJECT` verifies the project still exists, so a
  deleted project is a `404` instead of an empty list.
- **Expiry** is mandatory (`expiresInDays` 1..365, default 7). **Revocation**
  sets `revokedAt`; both are checked on every resolve.
- **Optional passphrase** is hashed with the existing scrypt password hasher and
  verified on resolve; a missing/wrong passphrase is `403` while an unknown token
  is `404`, so the two codes do reveal that a token exists. Accepted trade-off:
  the 256-bit token is the secret, and holding it without the passphrase still
  yields no payload.
- **Public resolve is a POST** (`/public/shares/:token`) so a passphrase never
  lands in a URL/cookie/access log. It is `@PublicEndpoint`, uses the login
  per-IP rate-limit bucket, and returns a deliberately narrow read-only payload:
  project/test/run identity, status and counts — no screenshot URLs, no actions,
  no API-key or user data.
- **Audit:** `share.create`, `share.revoke`, and `share.access` (actor null,
  link id, IP/user-agent) are written; the link row also tracks access count and
  last access.
- **UI:** `/share/:token` is a bare, unauthenticated page with a passphrase step
  when needed and a read-only rendering; the project detail gets a Share dialog
  for create/list/revoke/copy. There is no approve/edit control on the public
  page.

## Alternatives considered

- **Signed JWT links** (rejected): stateless but not revocable without a
  denylist; the DB row also carries access count/audit.
- **Guest accounts / magic links** (rejected): account lifecycle, sessions,
  permissions for a one-off view.
- **Passphrase in the URL** (rejected): leaks through referrers/logs; POST body.
- **Exposing existing authenticated endpoints with a token** (rejected): the
  public payload must be a separate, narrow contract.

## Consequences

- Anyone with the URL (and passphrase) can read the shared scope until expiry or
  revocation; treat the URL as a secret.
- Access rows grow with views; bounding them is an open follow-up. R15 shipped
  the storage/quota retention story without an audit or share-access sweep, so
  this is not "already handled by R15".
- No screenshots are embedded; stakeholders see status/counts, not pixels.
- Target rename/delete intentionally breaks the link with `404`.
