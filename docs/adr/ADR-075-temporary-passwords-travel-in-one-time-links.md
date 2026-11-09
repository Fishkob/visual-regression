# ADR 075: A Temporary Password Travels in a One-Time Link

## Status

Accepted — 2026-11-25. Amends the lifecycle bullets of
[ADR-031](./ADR-031-users-roles-permissions.md): `POST /users` and
`POST /users/:id/reset-password` no longer return the temporary password.

Enforced by `user-invite.spec.ts` (derivation, status matrix),
`users.service.spec.ts` (issue, preview, reveal, consume), the
`users-administration.e2e-spec.ts` cases (single use, expiry, replacement, 404
and 410), the `20261124130000_user_invite` migration, and the invite page's
gallery case plus its keyboard case in the CT suite.

## Context

Creating an account produced a temporary password and handed it to the admin in
a dialog. The admin then had to carry it: copy it, paste it into a chat or a
mail, and hope the channel was the right one. Three things are wrong with that.

The credential is in the wrong hands. The person who needs it is not the person
who receives it, and the admin's clipboard, chat history and screen are all
places it did not need to be. It also never expires: the account keeps that
password until the user first signs in, which for an account created in a hurry
can be weeks. And "the admin saw the password" is a fact nobody can audit
afterwards — the trail records that an account was created, not who else saw the
credential.

The requirement is the opposite: the password must reach the _user_ exactly once,
and afterwards there must be nothing left to retrieve.

## Decision

**Account credentials are issued as a one-time link, and the password is derived
from the token that link carries.**

- `POST /users` and `POST /users/:id/reset-password` return
  `{ invite: { token, expiresAt } }` and never a password. The link is
  `<origin>/invite/<token>`; the admin copies the URL and sends it to the person
  whose account it is.
- Only the token's SHA-256 is stored (`UserInvite.tokenHash`, `hashToken`), like
  every other bearer credential in the schema. One outstanding invite per
  account: `userId` is unique and every issuance replaces the previous row, so a
  reset cannot leave an older link able to reveal a superseded credential.
- **The password is not stored.** It is `HKDF-SHA256` over the token (salt
  `vrt/user-invite/salt/v1`, info `vrt/user-invite/password/v1`, 15 bytes = 20
  base64url characters) and hashed with scrypt into `User.passwordHash`, which is
  the only form that reaches the database. Deliberately a fast derivation and not
  a password KDF: the input is a random 256-bit token rather than a secret a
  human chose, so there is nothing to brute-force, and a memory-hard hash here
  would only make every reveal cost a KDF's worth of memory. The credential is
  protected at rest by the scrypt hash, not by the derivation.
- The link works for seven days, and stops being "pending" for two reasons
  besides expiry: it was revealed (`consumedAt`), or the credential it carries is
  no longer outstanding — the account was deactivated, or the user already
  changed the password that `mustChangePassword` forces.
- Two unauthenticated routes, deliberately separate:
  - `GET /public/user-invites/:token` answers `{ username, role, expiresAt,
status }` and **does not consume**. Chat clients and mail scanners fetch
    every URL they are shown; a reveal that ran on GET would be spent before the
    human clicked it.
  - `POST /public/user-invites/:token/reveal` spends the link and answers the
    password. The single-use guard is the `WHERE consumedAt IS NULL` of the
    `updateMany`, not a read-then-write, so two parallel reveals cannot both
    win. The consumption and its `user.invite-redeem` audit row (actor `null`,
    with IP and user agent) commit in one transaction.
- The admin's dialog shows the link. No admin route returns a password, so the
  only place the temporary password exists is the reveal response and the
  account hash.

Why derived rather than encrypted: the alternative is a reversible column under
an environment key (the shape [ADR-062](./ADR-062-totp-seeds-are-encrypted.md)
used for TOTP seeds). That adds a permanent secret to every deployment and a
value at rest that a leaked key turns back into credentials. Deriving needs
neither, and it is strictly stronger against a database dump: the row holds
`sha256(token)` and `scrypt(password)`, and going from the first to the token
means inverting SHA-256. The token itself only exists in the link.

## Consequences

- The admin can no longer see the password — if the link is lost before the
  user opens it, a reset issues a new one. That is the trade: the admin handles
  a link that expires and is worthless after one reveal instead of a credential
  that is valid until the user's first sign-in.
- The token travels in a URL, so it lands in browser history, in the referrer
  header of any page the invite page links to, and in whatever chat log it was
  pasted into. Bounded by: one reveal, seven days, a forced password change at
  first sign-in, and the fact that the credential behind it is temporary. A link
  that leaks after the user changed the password reveals nothing, because the
  status read turns `used` the moment `mustChangePassword` is false.
- The request path is the one place the token would have leaked into our own
  logs: `redactUrl` replaces the path segment for `/public/user-invites/…`, the
  same rule it already applied to `/public/shares/…`. The `X-Forwarded-*` and
  access-log output of a reverse proxy in front of the API is still the
  operator's responsibility, as it is for a share link.
- `POST /users` and `POST /users/:id/reset-password` change shape for API
  consumers: `temporaryPassword` is gone. The generated SDK, the frontend and
  the e2e suites move in the same change, and the field only ever served the
  admin dialog.
- A change to the derivation label invalidates every outstanding link at once —
  the password no longer matches anything. That is deliberate and documented
  here; it is not a value to "tidy up".
- Two public routes joined the unauthenticated surface (`/public/user-invites/*`).
  They carry `@PublicEndpoint()`, the reveal is rate-limited with the `login`
  bucket, and both answer 404 for an unknown token and 410 for a spent or
  expired one, so the page can explain a dead link instead of reporting a
  failure.
- Rejected alternatives: **keep returning the password** (the admin carries a
  credential out of band, and it never expires); **mail the password** (the
  product has no mail transport, and adding one to deliver a credential is a
  larger change than the problem); **store the password encrypted under an
  environment key** (a permanent secret and a reversible column for the same
  guarantee — see above); **let the link set a password instead of revealing
  one** (a different onboarding flow: it needs a new form, a new validation
  surface and a new way for the invited person to prove who they are, while
  keeping the existing `mustChangePassword` gate costs nothing).
