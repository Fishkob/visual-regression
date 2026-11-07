# ADR 023: No Reject Endpoint

## Status

Accepted — 2026-08-05

Amended 2026-11-07: the pending-vote and 4-eyes complication quoted in the Context no longer exists — [ADR-066](./ADR-066-remove-the-four-eyes-approval-gate.md) removed the approval quorum and the `ApprovalVote` table. A reject endpoint would be a thinner addition today than the Context describes; the decision not to have one stands.

## Context

`CONTEXT.md` described the review loop as "a reviewer needs to approve or reject the change." The platform API exposes approval but no rejection action — the only way to discard a pending change is deleting the test (or the variant's screenshots) via the deletion endpoint.

## Decision

Rejection is deliberately out of scope for the API. There is no reject endpoint.

A pending comparison does not need an explicit reject action because the platform already retires it through three existing paths:

- **Superseded by a newer upload** — `ComparisonRetirementService.supersedeForVariant` → `UnifiedComparisonsRepository.retirePendingForVariant` clears the pending comparison (and, on the identical path, the candidate row) synchronously on upload.
- **Threshold auto-accept** — raising the baseline threshold retires pending comparisons at or below the new value via `ComparisonRetirementService.retirePendingComparisons` → `UnifiedComparisonsRepository.deletePendingByIds`.
- **Deletion** — `DELETE /projects/:projectName/tests/:testName` (optionally variant-scoped) removes the comparison and its files.

Approval and rejection would share the same retirement mechanics (`ComparisonRetirementService` owns the side effects — comparison deletion, candidate reclamation, job cancellation), but the retirement seam is no longer the whole job: since review governance landed ([ADR-039 (Review Assignment, Due Dates and 4-Eyes)](./ADR-039-review-assignment-four-eyes.md), [ADR-041 (Review Governance and Human-Only 4-Eyes)](./ADR-041-review-governance-human-4-eyes.md)) a reject would also have to decide what happens to the retired comparison's pending votes (the `ApprovalVote` rows are keyed on `comparisonId`), account for the reviewers it was assigned to, and stay inside the 4-eyes invariant (N > 1 rejects an API-key actor outright). That is review-state logic, not a thin addition over the retirement seam.

## Consequences

- `CONTEXT.md` no longer promises a reject action; it describes the approve flow and the retire mechanics that remove pending changes.
- The API surface stays minimal: no new endpoint, no new DTO, no frontend contract change.
- If rejection becomes a product requirement, the endpoint can be added without revisiting this decision's domain model.
