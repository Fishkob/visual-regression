# ADR 031: Users, Roles and Permissions

## Status

Accepted — 2026-10-25

Amended — API-key permissions moved to scopes (ADR-035/045); account lifecycle
is metadata-driven.

## Context

The platform has one bootstrap admin and every authenticated principal is
all-powerful: a session or an API key can approve, delete projects, create more
API keys, and read the audit log. A team cannot share the installation without
handing out full control. There is no user management beyond the env-seeded
bootstrap account, no way to deactivate a person, and no forced password
rotation for a temporary credential.

The API-key model (ADR-025) deliberately treats a key as a CI credential, not
as a human identity; R11 adds key scopes. R9 must not make a leaked CI key
able to administer users.

## Decision

Introduce a **global role** on `User`:

- `ADMIN` — users, API keys, project/branch deletion, webhook settings, audit.
- `MEMBER` — uploads, approvals, baseline restore, test/variant deletion,
  review reads.
- `VIEWER` — read-only.

**Enforcement is centralized in the global `AuthenticationGuard`.**

- The session path loads the user on every request and attaches
  `{ userId, username, role, mustChangePassword }`; a deactivated user is
  rejected and its sessions are deleted.
- The API-key path attaches `role: 'MEMBER'`, or `'ADMIN'` when the key carries
  the `admin` scope (ADR-035, ADR-045); it never inherits the creator's role.
  What a key may actually do is decided by its scopes.
- Admin-only routes declare `@Roles('ADMIN')`; the guard rejects any other role
  with 403. This is applied to users, API keys, audit, webhook settings and
  project/branch deletion.
- A global write rule makes `VIEWER` read-only: every non-GET/HEAD/OPTIONS
  request is rejected except on the account-lifecycle routes, marked with
  `@AccountLifecycle()` (sign-out, `/auth/me`, password change, own 2FA and
  sessions). The exemption is decorator metadata rather than a path check,
  because a project, test or run literally named `auth` matched the old
  `path.includes('/auth/')`. The UI mirrors this by hiding write controls, but
  the API is the authority.
- `mustChangePassword` blocks every route outside the account-lifecycle surface
  with 403; a temporary password can only be used to read `/auth/me` and change
  itself.

**Lifecycle.**

- `POST /users` creates a user with a one-time temporary password
  (`mustChangePassword = true`); the password is returned once and only its
  hash is stored.
- `PATCH /users/:id` changes role and active state. Deactivation deletes every
  session; reactivation does not resurrect them.
- `POST /users/:id/reset-password` issues a new one-time password and deletes
  every session.
- The last active `ADMIN` cannot be demoted or deactivated, and an admin cannot
  deactivate their own account; otherwise an installation can lock itself out.
- `POST /auth/change-password` verifies the current password, stores the new
  hash, clears `mustChangePassword`, revokes all sessions and issues a fresh
  one (so a stolen cookie dies with the old password).
- The bootstrap user is created as `ADMIN`; the migration promotes the oldest
  existing user when no admin exists (upgrade path).
- Every user/permission change is recorded in the audit log (`user.create`,
  `user.update`, `user.reset-password`).

**Frontend.** The `/auth/me` role is the single source for the current
principal. Admin nav/routes are gated by role, and write controls are hidden
for `VIEWER`. A `403` from a stale UI is still handled as an error, never as
success.

## Alternatives considered

- **Per-project memberships** (rejected for v1): groups are review
  organization, not permissions; per-project ACLs multiply the matrix and the
  UI before there is a team model. Global roles are enough for self-hosting.
- **Per-route viewer decorators** (rejected): forgetting one write endpoint
  would silently grant a viewer write access. The default-deny global write
  rule fails closed; admin elevation stays explicit.
- **API keys inherit the creator's role** (rejected): a leaked CI key would
  become an admin credential. Keys stay `MEMBER` unless they are explicitly
  given the `admin` scope (ADR-035/045).
- **Deleting users** (rejected): audit rows and `createdBy` references must
  survive; deactivation is reversible and leaves the record.

## Consequences

- Role changes take effect on the next request (the user row is read per
  request), no re-login required.
- Every request with a session does one extra user lookup; acceptable for a
  self-hosted review tool and needed for immediate deactivation.
- A VIEWER cannot perform bulk approval or mutation through a crafted request,
  not just through a hidden button.
- R11 did replace the hard-coded API-key `MEMBER` role with key scopes without
  weakening the admin-only routes (ADR-035/045).
