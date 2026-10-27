# ADR 039: Review Assignment, Due Dates and 4-Eyes

## Status

Accepted — 2026-10-25; Amended 2026-10-25 (human-only 4-eyes keyed by principal
id; the review policy is ADMIN-owned — see
[ADR-041](./ADR-041-review-governance-human-4-eyes.md)).

## Context

The inbox is a shared queue. There is no ownership ("who reviews this?"), no due
date or aging view, and one approval is final — regulated teams need two
different reviewers before a baseline changes.

## Decision

**4-eyes approvals.**

- `Project.requiredApprovals` (default 1). `ApprovalVote` stores one row per
  comparison + reviewer (unique), so the same reviewer cannot count twice.
- With N > 1 the approval endpoint records a vote and returns
  `{approved:false, requiresMoreApprovals:true, votes, required}` while the
  comparison stays PENDING. The vote that reaches the threshold runs the existing
  finalization path (baseline write, `Approval` row, audit, webhook); the final
  approver is recorded on `Approval`, all voters remain in `ApprovalVote`.
- The approval mutation runs in the existing retried Serializable workflow; the
  service rejects a second vote by the same principal with a `409` (`CONFLICT`)
  before recording it, the unique vote constraint stays as the backstop, and the
  transaction retry makes a concurrent last-vote race resolve to one finalization.
- N = 1 keeps the old behavior (no vote rows, same response shape).

> Votes are keyed by principal id and API keys cannot vote for N > 1; the review
> policy is ADMIN-owned. See
> [ADR-041](./ADR-041-review-governance-human-4-eyes.md).

**Assignment and due dates.**

- `ReviewAssignment` links a project + branch and a test or run to an assignee
  (`User`), with `assignedBy`, optional `dueAt`, `completedAt`. Creation is
  session-only (a human act), validates the assignee is an active user, and
  writes `review.assign` plus — when the assignment names a test — a
  `review.assigned` webhook outbox row. A run-only assignment has no test payload
  and sends no webhook.
- `GET /assignments/mine` (optionally completed), `GET /assignments/mine/overdue`
  and `POST /assignments/:id/complete` are assignee-scoped.
- The inbox gains `assignedToMe=true` (test assignments only; run assignments do
  not expand to their tests in v1). The filter is server-side, so pagination and
  counts stay truthful.
- Aging is derived (`isOverdue` + dueAt), not stored; the overdue endpoint is the
  report seed.

**Alternatives.** Storing multiple `Approval` rows per comparison would break
the "one approved row" read model; a separate vote table keeps the final trail
unambiguous. Assignment via API keys was rejected (no human identity). Run
assignment expansion into the inbox was deferred because a run can outlive its
test assignments and the inbox is test-shaped.

## Consequences

- A 4-eyes project changes the approval response contract; the UI must show
  vote progress and not treat `approved:false` as an error.
- Assignments are session-only; CI cannot self-assign.
- Overdue is computed at read time; there is no background due-date notifier
  beyond the assignment webhook.
