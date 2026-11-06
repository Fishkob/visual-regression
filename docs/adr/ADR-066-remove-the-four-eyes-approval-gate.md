# ADR 066: The 4-Eyes Approval Gate Is Removed

## Status

Accepted — 2026-11-05. Supersedes the 4-eyes approval decision in
[ADR-039](./ADR-039-review-assignment-four-eyes.md), the 4-eyes half of
[ADR-041](./ADR-041-review-governance-human-4-eyes.md), and the vote-retention
decision in [ADR-050](./ADR-050-approval-votes-are-audit.md).

## Context

ADR-039 and ADR-041 built an approval quorum: a project could set
`requiredApprovals > 1`, each reviewer's approval recorded an `ApprovalVote`
instead of finalizing the comparison, and the vote that reached the threshold
ran the approval path. API keys were rejected for N > 1, and the counts were
owned by an ADMIN-only `PATCH /projects/:projectName/review-policy`.

The mechanism carried a cost beyond its own surface. The approval transaction
needed an advisory lock and a retry budget measured in voters (the last of ten
simultaneous voters needed ten attempts, `APPROVAL_MAX_ATTEMPTS`), the response
contract grew a second shape (`approved: false`, `requiresMoreApprovals`,
`votes`, `required`), every "approve many" caller had to render a pending
bucket, and the review policy gained its own ADMIN-only endpoint, DTO pair,
audit action and UI dialog. Votes were kept forever as audit (ADR-050), and the
history tables that survive a test deletion included one whose only reader was
the quorum.

The gate was accepted on the product promise that regulated teams need two
reviewers before a baseline changes. This ADR withdraws that promise: the quorum
is no longer carried, and with it goes the concurrency machinery — the
voter-sized retry budget, the second response shape and the pending half of every
batch — that existed only to make N simultaneous voters settle correctly.

## Decision

The 4-eyes gate is removed. One approval finalizes a comparison again, from a
session or from an API key with the `approve` scope.

- `Project.requiredApprovals` and the `ApprovalVote` table are dropped
  (`20261124105000_remove_four_eyes`). The migration deletes the stored votes
  deliberately: they had no reader once the gate was gone.
- The approval response has one shape (`approved`, `newBaselineUrl`,
  `signedNewBaselineUrl`). `requiresMoreApprovals`, `votes` and `required` are
  gone, and so is the `pending` bucket of both the test's "approve all" and the
  run's — a batch reports approved and failed items only.
- `PATCH /projects/:projectName/review-policy`, its DTOs, the
  `project.review-policy` audit action, the `review.vote` audit action and the
  project settings "review policy" dialog are removed. The pixel thresholds stay
  ADMIN-owned and audited; that governance decision never depended on the
  quorum.
- Approval is no longer keyed on the principal. API keys approve under their key
  name, like any other actor, because there is no second vote left for a single
  operator to forge. The principal type remains for the routes that genuinely
  require a person (assignments, comments) and now lives in
  `common/domain/principal.ts`.
- The per-comparison advisory lock and serializable retry stay. Two reviewers
  can still approve the same comparison at the same time; the lock makes one
  win and the other observe the settled row. The retry budget is its own
  constant again, sized for a queue one deep (`APPROVAL_MAX_ATTEMPTS = 3`)
  instead of one attempt per voter.

## Alternatives considered

- **Keep the schema, remove only the UI.** Rejected: a column with no writer and
  a table with no reader invite a half-rebuilt feature and keep the concurrency
  edge cases alive in a path nobody exercises.
- **Keep `ApprovalVote` as audit and only stop writing it.** Rejected: ADR-050
  kept the votes because they were the proof of _who supplied the four eyes_.
  With no quorum there is nothing to prove beyond the single `Approval` row,
  which already names the approver.
- **Make the quorum a per-test setting instead of per-project.** A smaller
  surface, but it keeps the second response shape, the vote table and the
  API-key rule — the parts that cost the most.
- **Keep the ADMIN-owned review-policy endpoint for a future policy field.**
  Rejected: an endpoint whose only field is gone is dead surface; a new policy
  field arrives with its own endpoint.

## Consequences

- Every "approve all" path answers one bucket fewer, and the run approve-all
  toast no longer has a "waiting for additional approval" case.
- `ApprovalVote` rows are deleted by the migration. A project that had a gate
  keeps its `Approval` rows and audit trail; only the per-reviewer votes are
  lost, and the new ADR records that this was intentional.
- The approval retry budget is no longer derived from a review-policy ceiling,
  so a future quorum would need to re-derive it (that is the point of a new ADR).
- The e2e suite loses `four-eyes.e2e-spec.ts` and `review-policy.e2e-spec.ts`;
  the concurrency cases that remain cover the single-approval race, which is
  still reachable.
