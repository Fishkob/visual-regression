# ADR 041: Review Governance and Human-Only 4-Eyes

## Status

Accepted — 2026-10-25

## Context

The R19 review found two governance gaps:

- `requiredApprovals` could be changed through the generic project PATCH by any
  MEMBER and without an audit row; `pixelDiffThreshold` could be raised by a
  MEMBER, auto-accepting pending comparisons without an `Approval` row or a
  record of who relaxed the gate.
- 4-eyes votes were keyed on the username. An API key votes under its key name,
  and key names were not unique, so two CI keys could satisfy N=2 for a single
  operator. Earlier voters' reasons were also lost. Only the finalizing approval's
  reason/note is the decision of record (`Approval.reason`/`note`), so a partial
  vote deliberately carries none and `ApprovalVote` has no column for one (see
  ADR-040).

## Decision

**Review policy is ADMIN-owned and audited.**

- `requiredApprovals` is removed from the generic `UpdateProjectDto`; a generic
  PATCH with the field is a 422. The dedicated
  `PATCH /projects/:projectName/review-policy` is `@Roles('ADMIN')`, validates
  1..10 and writes `project.review-policy` with `{from, to}`.
- `PATCH /projects/:p/tests/:t/threshold` (including `preview=true`) is
  ADMIN-only. The committed update writes `test.threshold` inside the existing
  `StateChangeWorkflow` transaction with `{from: [previous thresholds], to,
autoAcceptedCount}`; preview never audits or mutates.

**4-eyes is human-only.**

- Approval principals carry `principalType: 'user' | 'apiKey'` and a stable
  `principalId` (session user id / API-key id).
- When a project's `requiredApprovals > 1`, an API-key approval is rejected with
  `403` inside the approval transaction. N=1 keeps API-key approvals working.
- `ApprovalVote.userId` stores the principal id; `username` stays display-only.
  Each partial vote writes `review.vote` with
  `{comparisonId, votes, required, principalType}` in the same transaction.
  Duplicate-vote 409s are not audited; the finalizing vote writes the existing
  approval audit.
- `ApiKey.name` is unique. Create/rotate map P2002 to a 409 "name already
  exists"; rotation releases the predecessor name (`<name> (rotated <id>)`)
  before creating the successor so the stable name can be reused.

## Alternatives considered

- **ADMIN-only generic project PATCH**: blocks MEMBER project rename/move; too
  broad. A dedicated endpoint scopes the permission to the policy field.
- **Audit only, keep MEMBER writes**: the audit records a bypass but does not
  prevent it; regulators expect the gate to be admin-owned.
- **Keep username-keyed votes and reject duplicate key names**: still lets one
  operator create two distinctly named keys; principal type is the actual
  requirement.
- **Backfill old votes**: pre-release votes are dev data; a username cannot be
  reliably mapped after renames. New votes use ids; the ADR documents the break.

## Consequences

- MEMBERs can no longer tune thresholds or review policy; the UI hides both for
  non-admins and the threshold preview is admin-only.
- CI keys cannot cast a 4-eyes vote; bulk/run paths report the rejection as a
  per-item failure, single approval returns HTTP 403.
- API-key names are now a unique namespace; rotation keeps the active name but
  renames the retired row.
- Historical `ApprovalVote.userId` values written before this change remain
  usernames; they are not migrated.
