# ADR 078: The Audit Trail Has a Retention Window

## Status

Accepted — 2026-11-13. Supersedes the "`AuditEvent` is kept forever" half of
[ADR-050](./ADR-050-approval-votes-are-audit.md); its vote-retention decision is
already superseded by [ADR-066](./ADR-066-remove-the-four-eyes-approval-gate.md).

Enforced by: `AUDIT_RETENTION_DAYS` (`config/env.validation.ts`,
`AppConfigService.auditRetention`), `AuditRetentionTask` and its registration in
`DataDeletionModule`'s `MAINTENANCE_TASKS`, and the `cleanup_audit_events_*`
gauges.

Amended 2026-11-13: `ComparisonOutcomeEvent` — named here as the one table left
unpruned — got a window of its own in
[ADR-079](./ADR-079-outcome-history-retention.md).

## Context

`AuditEvent` was the one table the product promised never to prune. The promise
was written as a feature ("the compliance trail") and read as a burden by every
operator: the only documented escape was to archive or purge the table manually,
outside the application, on a schedule the deployment had to invent.

The trail grows with usage, and two of its writers grow with traffic rather than
with governance: an approval per reviewed change and a `share.access` row per
share-link open — the latter carrying the visitor's IP and user agent. The read
path is `OFFSET` + `COUNT` (the comments got keyset pagination in N2, the audit
did not), so every page and every count pays for the whole table. Nothing purges
it, and a row that never expires is a row that cannot be deleted under a
retention policy a deployment might owe someone.

The opposite of the promise is also wrong: a compliance deployment exists that
has to keep the trail for the lifetime of the database, and the platform must
not decide that for it.

What the trail actually buys is narrow and time-bound: it is the only record of
a destructive action once the domain row is gone, so it is what tells an operator
_what_ to restore and _from which point_. That job is bounded by the backup
window — a trail older than the oldest restorable backup answers a question
nobody can act on any more.

## Decision

The audit trail is pruned after a configurable window.

- **`AUDIT_RETENTION_DAYS`** — integer, default **90**, `0` keeps the trail
  forever. It is the second window whose off-state is a value (after
  `BRANCH_RETENTION_DAYS`), because "keep everything" must remain reachable for a
  deployment with a compliance duty and cannot be expressed as a number of days.
- **One task, in the worker.** `AuditRetentionTask` deletes rows older than the
  cutoff under its own advisory lock, next to the other eleven task files, and
  reports `cleanup_audit_events_deleted` / `cleanup_audit_events_last_run`. It
  deletes in batches of 10 000 ids (each batch its own transaction) and stops at
  100 batches per run: the first sweep after an upgrade faces a backlog on a table
  that has never seen a `DELETE`, and one statement of that size would hold a long
  lock and leave an autovacuum storm behind. A larger backlog is cleared over the
  following nights; the gauge says how far it got.
- **One window, not one per action.** `share.access` — the row carrying IP and
  user agent — is a privacy cost that argues for a short window, while the
  governance actions argue for a long one. A single number is the compromise:
  the PII expires with the governance trail instead of outliving it. Per-action
  windows (a short one for access rows, a long one for the rest) are the better
  shape and stay a refinement for when a deployment asks; the roadmap's open
  question about `share.access` is answered by the clock until then, not by
  per-action pruning.
- **The window is not the review's.** A deployment sets it at least as long as
  its backup retention; the docs say so. The default of 90 is chosen against a
  typical 30-day backup window and the lag with which a leaked key or a wrong
  threshold is noticed — not against the table's size, which is small either way
  (~540 B per row including indexes).
- **The trail keeps every action it has.** Narrowing the actions it records is a
  product decision about _what is audit_, not a volume fix, and is deliberately
  not bundled here. The volume is review activity: `approval` duplicates the
  durable `Approval` row (which has no foreign key and outlives the project),
  while `review.comment` and `review.assign` are the _only_ survivors once their
  cascading domain rows are deleted — so dropping them would delete audit, not
  noise. The question stays open rather than being answered by a retention task.

## Alternatives considered

- **Keep the table forever (the status quo).** Rejected: an unbounded table with
  no application-level way to prune, holding IP addresses and user agents from
  every share-link open, and a documented instruction that pushes the problem to
  the operator.
- **30 days as the default.** Rejected as a default (allowed as a value): it is
  shorter than the backup window most deployments run and shorter than the lag
  with which incidents are noticed, so the trail would expire exactly when it is
  needed. It also makes "restore the state before the deletion" impossible to
  scope.
- **Trim review actions instead of adding a window.** Rejected for now: it fixes
  neither the unbounded table nor the IP/user-agent lifetime, it changes the
  audit's definition (comments and assignments are the only record left after a
  test or project deletion, while approvals survive in `Approval`), and the
  CONTEXT rule "audit rows ride the mutation's transaction" names those writers.
- **Table partitioning plus archival export.** Deferred: the right shape for a
  deployment that must keep years of trail, but it is infrastructure the product
  does not need yet.
- **Soft delete (`deletedAt`) instead of `DELETE`.** Rejected: the rows would
  still be there, paying every cost the window exists to remove.

## Consequences

- [deployment.md](../deployment.md#retention-runs-in-the-worker) lists `AuditEvent`
  among the configurable windows; `ComparisonOutcomeEvent` was the one table left
  unpruned at the time (closed by [ADR-079](./ADR-079-outcome-history-retention.md)).
- A deployment with a compliance duty sets `AUDIT_RETENTION_DAYS=0` and inherits
  the growth it previously had no choice about.
- The audit stops promising an answer older than the window. Operators document
  the window next to their backup retention; after the window the answer to "who
  deleted this" is a backup, not the trail.
- The first sweep after an upgrade deletes the backlog in batches — at most
  1 000 000 rows per run, oldest first — and later runs delete one window's share
  per day. A deployment upgrading with years of trail should expect several
  nights of sweeping, not one long transaction.
- Every existing deployment starts pruning at 90 days unless it sets
  `AUDIT_RETENTION_DAYS=0`. That is a deliberate default-on change against a
  previously documented "never pruned" promise: the release note has to say it,
  and the Helm chart exposes the worker's value so an operator can opt out.
- The roadmap's open question about audit retention becomes the narrower question
  about `ComparisonOutcomeEvent`, which was append-only forever until
  [ADR-079](./ADR-079-outcome-history-retention.md).
- `CONTEXT.md` states the window in the `AuditEvent` glossary entry, because
  "rows outlive the rows they name" is no longer unconditional.
