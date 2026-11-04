# ADR 061: A project is named, but its identity is the id

## Status

Accepted — 2026-11-24. Supersedes the name-keyed storage of
[ADR-038](ADR-038-share-links.md) (share links), the name attribution of
[ADR-049](ADR-049-outcome-project-attribution.md) (outcome trends) and the
name-keyed allowlist of [ADR-035](ADR-035-api-key-scopes.md).

Enforced by `pending-comparison-invariant.e2e-spec.ts` (a deleted project is
removed from every api-key allowlist), `share-links.e2e-spec.ts` (the link row is
gone with its project) and the repository/guard specs that now read `projectId`.

## Context

A project can be renamed (`PATCH /projects/:projectName`) and its name is free
again after a deletion. Everything that stored the name therefore had two
failure modes:

- **Rename broke the reference.** A share link kept the old name and answered
  404; an api-key allowlist stopped matching; the approval trail, the audit
  filter and the trend aggregates (one `WHERE "projectName" = $1` each) stopped
  finding the project's own history.
- **A recycled name adopted the old rows.** Deleting `acme` and creating a new
  `acme` re-validated every unexpired share token against the new project —
  serving someone else's evidence — and a key scoped to `acme` regained access.
  The delete path already knew this ("recreating the name would revive every old
  token"), but a rename had no such guard.

The live database demonstrated the second class: `ShareLink` rows whose project
no longer existed, left by a direct project delete (`TestApp.resetDb`), which is
exactly the path a name key cannot guard.

## Decision

**Live references use the id; the name stays as the display value.**

- `ShareLink.projectId` is a foreign key with `ON DELETE CASCADE` and an index.
  The DTO still says `projectName`; the repository reads it through the
  relation. Orphan links (their project already gone) are deleted by the
  migration, matching the rule the delete path stated.
- `ApiKey.projectIds` replaces `projectNames`. The API keeps `projectNames` in
  and out (no SDK break); the service resolves names to ids on create and ids to
  names on list. The guard resolves the request's `:projectName` to an id once
  per allowlisted request and compares ids — the only new query, and only for a
  key that has an allowlist. Unknown names are a `400` at create time instead of
  a silently useless entry. A key whose non-empty allowlist resolves to nothing
  is revoked by the migration, never widened to "all projects".
  A `BEFORE DELETE` trigger on `Project` removes the id from every key's
  allowlist, so no deletion path (service, studio, migration) leaves a dead id.
- `Approval`, `AuditEvent` and `ComparisonOutcomeEvent` get a nullable
  `projectId`, backfilled by name. `projectName` stays as the name at write time
  (display, and the fallback for a project that is already deleted). New rows get
  the id from a `BEFORE INSERT` trigger that resolves `projectName`, so every
  existing writer keeps writing what it wrote and no call site can forget it.
  Reads filter by id: approval history, the audit filter and the trends SQL.
- `ReviewComment.projectName` stays display-only: comments are read by
  `testId`, and the project-level delete already runs by test ids first.

## Consequences

- A rename no longer breaks a link, a key, an approval history, the audit filter
  or the trends window, and a recycled name no longer adopts another project's
  rows.
- One extra indexed project lookup per API-key request **with** an allowlist, and
  two lookups on key creation. Unrestricted keys pay nothing.
- The migration deletes orphan share links and revokes keys whose allowlist no
  longer resolves. Both rows were already unusable; keeping them would have been
  the unsafe choice.
- The history triggers are invisible to the Prisma schema diff. A future schema
  change to those tables must not drop them; they are named
  `<Table>_set_project_id` and documented in the migration.
