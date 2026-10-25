# ADR 035: API Key Scopes and Ownership

## Status

Accepted — 2026-11-08

## Context

R9 made API keys act as `MEMBER`: a leaked CI key can upload, approve and read
every project, and the key row has neither an owner nor a project boundary.
Rotation exists but cannot narrow access. A CI key only needs to upload and poll
its own job; approval and broad reads are separate privileges.

Keys are not humans and have no session; the R9 role matrix is the wrong tool
for them. A key must carry its own permissions, and the guard must reject a
request with a named missing scope.

## Decision

- **Key fields.** `ownerId` (nullable for admin-bootstrapped keys), `scopes`
  (`upload` | `read` | `approve` | `admin`), `projectNames` (empty = all
  projects). Expiry/rotation are unchanged; rotation inherits scopes, allowlist
  and owner.
- **Defaults.** A newly created key gets `['upload']`: upload plus reading its
  own `/jobs/:id` status. `read`, `approve` and `admin` are opt-in. Keys created
  before R11 migrate to `['upload', 'read', 'approve']` — their previous
  effective capabilities — and **not** `admin` (they could never delete or
  administer before R9/R11; promoting them would widen access silently).
- **Enforcement in the global guard** (one place, like roles):
  - safe requests require `read`, except job status which accepts `upload`;
  - `*/upload` requires `upload`;
  - approval/`baseline-restore` paths require `approve`;
  - every other write requires `admin`.
  - `admin` implies all scopes and grants the `ADMIN` role for the role layer;
    `@SessionOnly` still blocks keys from users/API-keys/webhooks/audit.
  - A missing scope is `403` with `API key is missing the "<scope>" scope`.
- **Project allowlist.** A non-empty `projectNames` restricts every route with
  a `:projectName` param. Project-spanning reads (`/projects`, inbox, audit,
  users) are rejected for a restricted key: filtering those safely is a larger
  change, and a scoped CI key does not need them. This limitation is documented.
- **UI.** The create dialog defaults to upload-only, offers the four scopes with
  an admin warning, and an "all projects" toggle plus per-project checkboxes.
  The list shows owner, scopes and project badges. Rotation notes inheritance.

## Alternatives considered

- **Join table for scopes** (rejected): four fixed scopes fit a Postgres text[]
  and avoid a join on every authenticated request; the guard reads the row
  anyway.
- **Per-endpoint decorators for scopes** (rejected for v1): the path-based
  mapping is centralized and testable; a missed decorator would silently grant
  access. A future move to `@Scopes()` can replace the mapping without changing
  the key model.
- **Keys inherit the owner's role** (rejected in R9, still rejected): a leaked
  CI key must never become an admin credential.
- **Grant `admin` to existing keys for "full compatibility"** (rejected): their
  effective permissions were upload/read/approve; admin would be a privilege
  increase on migration.

## Consequences

- CI pipelines using old keys keep working; new keys must opt into read/approve.
- A restricted key cannot list all projects or use the global inbox; it works
  against its allowed project routes (upload, status, runs, reports).
- Scope checks are path-based; new write endpoints default to `admin` (fail
  closed).
- Per-key rate-limit overrides and key templates remain out of scope.
