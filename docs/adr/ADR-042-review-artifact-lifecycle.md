# ADR 042: Review Artifact Lifecycle and Webhook Lease

## Status

Accepted — 2026-11-17

## Context

The review of R18–R20 found three silent-loss paths:

- Test/project deletion removed tests but left `ReviewComment` and
  `ApprovalVote` rows behind; nothing bounded or cleaned the orphan rows.
- A webhook delivery claimed as `PROCESSING` was never reclaimed after a worker
  restart, so an event could be lost without an alert.
- The comment read returned the oldest 200 rows, so on longer threads new
  comments were invisible even though the POST succeeded.

The approval reason was also absent from the generic audit row and the
`comparison.approved` webhook, making the structured reason unusable for
reports/notifications.

## Decision

**Artifact cleanup.**

- `TestDeletionService.deleteTestsInTx` deletes `ReviewComment` and
  `ApprovalVote` rows for the deleted test ids inside the same
  `StateChangeWorkflow` transaction, before the tests are removed. Project
  deletion additionally runs a `projectName`-scoped backstop.
- A new `ReviewArtifactCleanupTask` (lock id 1010, bounded to 10k rows per
  table per run) removes rows whose test no longer exists. It is the safety net
  for branch-cascade deletion and any historical orphans; deletion itself is
  still synchronous and transactional.

**Webhook lease.**

- `WebhookDelivery.claimedAt` is stamped when a dispatcher claims a row. Rows
  left `PROCESSING` for more than 10 minutes (falling back to `createdAt` for
  pre-migration rows) are returned to `PENDING` at claim time, with attempts
  unchanged and `nextAttemptAt = now()`. Delivery stays at-least-once;
  consumers deduplicate on `X-VRT-Delivery-Id`.
- Terminal/retry transitions clear `claimedAt`.

**Comment window and reason propagation.**

- The repository reads the newest 200 comments (`createdAt desc, id desc`) and
  reverses them for display, so the UI keeps chronological order while long
  threads stay current.
- The final approval writes `reason`/`note` into the approval audit metadata and
  into the `comparison.approved` webhook payload (omitted when empty), so audit
  exports and Slack/HTTP consumers can classify intended changes vs flakes vs
  infra.

## Alternatives considered

- **Cascade FKs for comments/votes**: votes intentionally have no FK because the
  comparison is deleted on approval; comments are history that should survive a
  comparison deletion but not a test deletion. Application-level deletion +
  maintenance task gives both properties without changing the historical row
  shape.
- **Delete old comments by age**: arbitrary; comments are review evidence. The
  task only removes true orphans.
- **Increment/webhook attempts to detect stuck deliveries**: could retry
  forever; a time lease is simpler and matches at-least-once semantics.
- **Cursor pagination for comments**: deferred; newest-200 fixes the immediate
  invisibility with no API change.

## Consequences

- Deletion now removes comment bodies and reviewer identities for the deleted
  test; project deletion's erasure claim holds for these tables.
- A worker crash costs at most the lease window before redelivery; duplicates
  are possible by design.
- Comments beyond 200 are still not visible until pagination lands (v2), but new
  ones are never hidden behind old ones.
- Audit/webhook consumers must tolerate the new optional `reason`/`note` fields.
