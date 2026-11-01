# ADR 053: Sessions Have an Absolute Lifetime

## Status

Accepted — 2026-11-01. Complements [ADR-034](./ADR-034-auth-hardening.md).

## Context

Sessions slide: every authenticated request extends `Session.expiresAt` once the
row is past half of `AUTH_SESSION_TTL_DAYS` (default 30). The intent is that an
active user is not logged out mid-work.

Sliding with no ceiling also means a stolen cookie never expires as long as the
thief uses it at least once per TTL. Session rows carry no absolute deadline and
are not bound to an IP or user agent, so the only mitigation was the session
list, which the owner has to look at.

There was a second inconsistency: the server slid the row but the browser cookie
kept its original `Max-Age`, so an active user was logged out after the first TTL
while the server still considered the session valid.

## Decision

A session has both an idle timeout and an absolute lifetime.

`AUTH_SESSION_ABSOLUTE_MAX_DAYS` (default 90) is measured from the row's
`createdAt`. `AuthenticationGuard` deletes the session and answers `401` once it
is reached, and sliding never extends past it (`expiresAt = min(now + ttl,
createdAt + absoluteMax)`). When the guard slides a session it also re-issues the
cookie with the same capped deadline, so the browser and the database agree.

## Alternatives considered

- **Drop sliding entirely.** Rejected: it forces every user through a login every
  TTL even when they work daily, which is the problem sliding was introduced for.
- **Absolute lifetime only, independent of activity.** Rejected: the same forced
  logout, just at a different point.
- **Refresh tokens / rotating sessions.** Rejected as a larger redesign; the
  absolute cap closes the "stolen cookie lives forever" hole without changing the
  credential model.

## Consequences

- A session ends at most `AUTH_SESSION_ABSOLUTE_MAX_DAYS` after login regardless
  of activity; the user logs in again once per quarter by default.
- A configured value below `AUTH_SESSION_TTL_DAYS` simply caps sessions earlier
  (the minimum wins); it does not fail startup.
- The cookie's `Max-Age` and the session row now move together, so a sliding
  session no longer keeps a row the browser has already dropped.
