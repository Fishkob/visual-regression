# ADR 067: Idle Branches Are Deleted by a Retention Window

## Status

Accepted — 2026-11-06. Supersedes the "auto-archiving is out of scope" clause of
[ADR-027](./ADR-027-branch-scoped-baselines.md) and the matching
"considered and rejected" line in the roadmap.

Enforced by: `BranchRetentionTask` (lock id `MAINTENANCE_LOCK_IDS.branchRetention`),
the `BRANCH_RETENTION_DAYS` / `Project.branchRetentionDays` window checked by the
Joi schema and by the column's CHECK, the `20261124110000_branch_retention`
migration, and the `cleanup_branches_deleted_total` / `cleanup_branches_last_run`
metrics.

## Context

A `Branch` row is materialized by the first upload that names it. The platform
never learns that the Git branch behind it was merged or deleted: nothing in the
product observes a merge, and a CI pipeline that stops uploading simply stops
talking. So a project's branch list, its tests, its baselines and its stored
evidence only ever grow. After a year a project shows branches of long-merged
pull requests next to the two that are alive, and the operator has to append
`?includeArchived=true` to a manual delete for each one.

The manual lifecycle exists and is safe: archive stops uploads, delete cascades
through tests, comparisons and runs, cancels jobs, reclaims only unreferenced
files and writes an audit row. What it lacks is a time trigger. Operators do not
prune a list that only grows slowly, and the branch they forgot is the one whose
review inbox entry they will never look at.

Two facts make the trigger harder than it looks. First, there is no "last
upload" timestamp to read. `UnifiedComparison` rows exist only for uploads that
differed, `Run.lastActivityAt` exists only for uploads that carried a run key
(and the key is optional), and `UnifiedScreenshot.createdAt` records when a
variant row was created, not when it was last written — an identical upload of a
stable page leaves no trace at all. Second, deletion is irreversible: a branch
that was merely quiet (an open PR waiting on design, a release branch frozen for
a month) must not be collected by a window that was meant for merged ones.

## Decision

A deployment can set a branch retention window, and the nightly worker deletes
the non-default branches that stayed quiet for it.

- `BRANCH_RETENTION_DAYS` is the deployment default and `0` (the default) means
  **off**: an installation that sets nothing deletes nothing. A project overrides
  it with `Project.branchRetentionDays` through `PATCH /projects/:name/storage`,
  next to the other retention settings; `0` there switches the sweep off for that
  project. The window is `>= 0` in the API, the Joi schema and the table's CHECK.
- `Branch.lastActivityAt` is the clock (`20261124110000_branch_retention`). The
  upload path touches it after a successful upload, on the bare connection, in
  one statement that resolves the default branch through the project row. The
  write is guarded to at most one per branch per five minutes, so the hottest
  endpoint in the system usually runs a no-op statement instead of taking a row
  lock, and it can never join the upload's Serializable transaction. A touch
  failure is logged and swallowed: the upload already committed, and a CI that
  retries would re-upload for a bookkeeping error.
- Existing branches get the migration's `now()`. The first sweep after an
  upgrade therefore cannot delete anything the deployment had not already left
  idle for the full window — the setting is opt-in twice.
- The candidate predicate is one query, shared by the sweep and the dry run
  (`BranchRepository.findInactive` / `countInactive`): not the project's default
  branch, **not archived**, not the target of another branch, no comparison in
  `PENDING_APPROVAL`, created before the cutoff and `lastActivityAt` before the
  cutoff. Archiving is the explicit "keep this one": the reversible action must
  be able to shield a branch from the irreversible one, and a branch someone
  archived on purpose is not a leftover. Any unreviewed comparison keeps the
  branch alive, because the sweep must never destroy review work nobody saw.
- Deleting reuses `BranchDeletionService` with the actor
  `system:branch-retention`: the same guards, the same cascade, the same
  unreferenced-file reclamation and the same `branch.delete` audit row as a
  manual delete. A guard that refuses one branch (a dependant appeared between
  the query and the delete) is logged and skipped; it does not abort the sweep.
- `GET /projects/:name/storage/preview` reports `branches: { days, eligible }`
  with the same predicate, so an admin can see the set before it goes. The
  sweep's count and its last run are exported as `cleanup_branches_deleted_total`
  and `cleanup_branches_last_run`.
- The sweep runs with the other maintenance tasks (nightly, one advisory lock
  per task) and only when a worker runs — the same operational rule as every
  other retention window (`docs/deployment.md`).

## Consequences

- A branch with an unreviewed comparison never disappears by itself: the
  operator has to review, retire or delete it first. That keeps the promise that
  pending work is not silently lost, at the cost of a branch that can outlive the
  window while it is blocked — which is exactly the branch someone still cares
  about.
- A branch that is still being uploaded never qualifies, even when every upload
  is identical and carries no run key, because the intake touches the clock on
  the success path rather than deriving activity from comparison or run rows.
- The clock is uploads, not reviews: approvals, comments and assignments do not
  keep a branch alive. A merged branch whose work was approved months ago is
  collected, which is the point.
- Deleting a branch still takes its runs and run uploads with it, so a run report
  URL for that branch stops working regardless of `RUN_HISTORY_RETENTION_DAYS`.
  The window is therefore not a storage policy for runs; it is a branch lifecycle
  policy that happens to free their evidence.
- The setting is a policy surface like the other retention limits: ADMIN-only on
  the route, audited (`storage.retention`) and reported by the preview.
- `Branch` gains a column and an index. The touch is one extra statement per
  upload in the common case; the sweep is one indexed query per project per
  night.
- Rejected alternatives: a **comparison-based clock** (identical uploads write no
  row, so an active run-less branch would look dead); **deriving activity from
  `UnifiedScreenshot.createdAt`** (rows are upserted in place, so it is the
  creation time of a variant, not the last write); **archive-only** (it hides
  the row but keeps growing the database, and the complaint is that the branches
  are still there); **a hard-coded window** (deployments have different review
  cycles, and 0 must be able to mean off); **deleting archived branches too**
  (it removes the only way to shield a branch without pausing the sweep for the
  whole project).
