# ADR 079: The Outcome History Has a Retention Window

## Status

Accepted — 2026-11-13. Narrows the "one table left unpruned" consequence of
[ADR-078](./ADR-078-audit-trail-retention.md) and replaces the "nothing prunes it
today" consequence of [ADR-033](./ADR-033-comparison-outcome-history.md); their
decisions stand.

Enforced by: `OUTCOME_RETENTION_DAYS` (`config/env.validation.ts`,
`AppConfigService.outcomeRetention`), the derived default in
`common/domain/trend-window.ts` — imported by the trends clamp
(`TrendsService`) and its query DTO, so a raised window raises the default with
it — `OutcomeRetentionTask` and its registration in `DataDeletionModule`'s
`MAINTENANCE_TASKS`, the `cleanup_outcomes_*` gauges, and
`outcome-retention.task.spec.ts`.

## Context

`ComparisonOutcomeEvent` is the trend/flake history: one row per completed
comparison, written after the comparison commits (a lost row must never roll back
a comparison) and carrying no foreign keys, so it outlives the test, branch and
comparison it names. It had no window, and [deployment.md](../deployment.md)
pushed the problem to the operator: size the database for it, or archive it by
hand on a schedule the deployment has to invent.

It grows with uploads — every comparison, every night, forever — so it grows
fastest exactly where the platform is used most. The audit trail's window
([ADR-078](./ADR-078-audit-trail-retention.md)) does not answer it: the two
tables have different readers and different reasons.

What makes this window easier than the audit trail's is the reader. The trends
endpoint clamps its window (`MAX_TREND_WINDOW_DAYS`, 365) and the query filters
`createdAt >= since`, so an outcome row older than 365 days is unreachable by
every read path in the product. There is no compliance duty on the table either:
it holds project and test names, variant, run key and outcome — no actor, no IP,
no user agent.

The one thing the table is not replaceable for is approval latency, which joins
`Approval` on `comparisonId`, and the daily changed/unchanged counts and flake
rate, which are the product's only view of how a project trends.

## Decision

The outcome history is pruned after a configurable window.

- **`OUTCOME_RETENTION_DAYS`** — integer, default **400**, `0` keeps it forever.
  It is the third window whose off-state is a value (after
  `BRANCH_RETENTION_DAYS` and `AUDIT_RETENTION_DAYS`), and the only one whose
  default deletes rows no read path can reach.
- **The default is derived, not written down.** It is
  `MAX_TREND_WINDOW_DAYS + 35` (`common/domain/trend-window.ts`), and the trends
  clamp and `TrendsQueryDto` read the same constant. Raising the window a
  deployment can read raises the default retention with it, so the invariant "the
  default only deletes unreachable rows" cannot rot into a comment nobody reads.
  The 35 days are slack for the clamp's edge: a row dated exactly at `since` is
  still served, and a window equal to the clamp would decide that boundary by
  clock skew.
- **One task, in the worker.** `OutcomeRetentionTask` deletes rows older than the
  cutoff under its own advisory lock (`1015`) and reports
  `cleanup_outcomes_deleted` / `cleanup_outcomes_last_run`. It uses the audit
  sweep's shape — batches of 10 000 ids, at most 100 batches per run — because
  the first run after an upgrade faces a backlog on a table that has never seen a
  `DELETE`, and one statement of that size would hold a long lock and leave an
  autovacuum storm behind.
- **One window for the deployment, not one per project.** A per-project window
  is a setting nobody asked for: the only reader is already project-scoped, and a
  project that wants a shorter history can be served by deleting its rows through
  the normal project deletion. The per-project precedent (`Project.orphanGraceHours`,
  N5) exists because a storage policy differed per project; this window is about
  the deployment's database, which is one.
- **No archive, no export.** The trends page is a dashboard, not a record. A
  deployment that needs the numbers outside the product exports the run CSV the
  reports already offer; an archival export is the same deferred shape as
  ADR-078's partitioning — the right answer for a deployment that must keep years,
  not a slice of this work.

## Alternatives considered

- **Keep the table forever (the status quo).** Rejected: unbounded growth that no
  application-level setting can bound, and a documented instruction that pushes
  the work to the operator. The rows are also unreachable long before they are
  deleted, so "forever" buys nothing a reader can use.
- **Default `0` (opt-in, like `BRANCH_RETENTION_DAYS`).** Rejected: branch
  retention destroys live domain rows, so it must be opted into. This window
  deletes rows no query can return, which is maintenance rather than a history
  decision — making it opt-in would leave the growth exactly with the deployment
  that never reads the operating docs.
- **Exactly `MAX_TREND_WINDOW_DAYS`.** Rejected: the boundary is inclusive
  (`createdAt >= since`), so a window equal to the clamp deletes the oldest day a
  request can still ask for. The default is deliberately larger.
- **A per-project window.** Rejected for now: no deployment has asked, the reader
  is already project-scoped, and a second override path multiplies the settings a
  project page has to explain. The global window stays the only knob.
- **Soft delete (`deletedAt`) instead of `DELETE`.** Rejected: the rows would
  still be there, paying every cost the window exists to remove.
- **Partitioning plus archival export.** Deferred for the same reason as in
  ADR-078: correct for a deployment that must keep years, not a cost the product
  needs yet.

## Consequences

- [deployment.md](../deployment.md#retention-runs-in-the-worker) no longer names
  an unpruned table; every table the product writes has a window now.
- An existing deployment starts deleting outcome rows older than 400 days after
  the upgrade. Nothing a user can still read is lost, but the deletion is
  irreversible: set `OUTCOME_RETENTION_DAYS=0` before upgrading if the raw history
  has to stay complete.
- Approval latency loses its data point for a comparison that was approved more
  than the window after it ran (the `INNER JOIN` drops the pair). The daily counts
  and the flake rate never saw those rows — their own window ends at 365 days.
- The roadmap's open question about `ComparisonOutcomeEvent` is answered. A
  deployment that wants a longer history sets a larger window; that is a setting,
  not a decision this ADR leaves open.
- `AUDIT_RETENTION_DAYS` and `OUTCOME_RETENTION_DAYS` answer different questions
  and must not be collapsed into one number: the audit window is bounded by the
  backup window (it scopes a restore), this one by the trends read (it removes
  rows nobody can ask for).
