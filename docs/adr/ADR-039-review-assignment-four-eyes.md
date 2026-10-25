# ADR 039: Review Assignment, SLA and 4-Eyes

## Status

Accepted — 2026-11-14

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
  unique vote constraint turns a double vote into a 409, and the transaction
  retry makes a concurrent last-vote race resolve to one finalization.
- N = 1 keeps the old behavior (no vote rows, same response shape).

**Assignment and SLA.**

- `ReviewAssignment` links a project + branch and a test or run to an assignee
  (`User`), with `assignedBy`, optional `dueAt`, `completedAt`. Creation is
  session-only (a human act), validates the assignee is an active user, and
  writes `review.assign` plus a `review.assigned` webhook outbox row.
- `GET /assignments/mine` (optionally completed), `GET /assignments/mine/overdue`
  and `POST /assignments/:id/complete` are assignee-scoped.
- The inbox gains `assignedToMe=true` (test assignments only; run assignments do
  not expand to their tests in v1). The filter is server-side, so pagination and
  counts stay truthful.
- Aging is derived (`isOverdue` + dueAt) rather than a stored SLA state; the
  overdue endpoint is the report seed.

**Alternatives.** Storing multiple `Approval` rows per comparison would break
the "one approved row" read model; a separate vote table keeps the final trail
unambiguous. Assignment via API keys was rejected (no human identity). Run
assignment expansion into the inbox was deferred because a run can outlive its
test assignments and the inbox is test-shaped.

## Consequences

- A 4-eyes project changes the approval response contract; the UI must show
  vote progress and not treat `approved:false` as an error.
- Assignments are session-only; CI cannot self-assign.
- Overdue is computed at read time; there is no background SLA notifier beyond
  the assignment webhook.
