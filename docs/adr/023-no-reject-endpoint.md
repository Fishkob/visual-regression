# ADR 023: No Reject Endpoint

## Status

Accepted — 2026-08-05

## Context

`CONTEXT.md` described the review loop as "a reviewer needs to approve or reject the change." The platform API exposes approval but no rejection action — the only way to discard a pending change is deleting the test (or the variant's screenshots) via the deletion endpoint.

## Decision

Rejection is deliberately out of scope for the API. There is no reject endpoint.

A pending comparison does not need an explicit reject action because the platform already retires it through three existing paths:

- **Superseded by a newer upload** — `ComparisonRetirementService.supersedeForVariant` → `UnifiedComparisonsRepository.retirePendingForVariant` clears the pending comparison (and, on the identical path, the candidate row) synchronously on upload.
- **Threshold auto-accept** — raising the baseline threshold retires pending comparisons at or below the new value via `ComparisonRetirementService.retirePendingComparisons` → `UnifiedComparisonsRepository.deletePendingByIds`.
- **Deletion** — `DELETE /projects/:projectName/tests/:testName` (optionally variant-scoped) removes the comparison and its files.

Approval and rejection would share the same retirement mechanics (`ComparisonRetirementService` owns the side effects — comparison deletion, candidate reclamation, job cancellation), so a future reject endpoint is a thin addition over the retirement seam — no new domain logic is required to add it later.

## Consequences

- `CONTEXT.md` no longer promises a reject action; it describes the approve flow and the retire mechanics that remove pending changes.
- The API surface stays minimal: no new endpoint, no new DTO, no frontend contract change.
- If rejection becomes a product requirement, the endpoint can be added without revisiting this decision's domain model.
