# ADR 033: Comparison Outcome History

## Status

Accepted — 2026-11-04

## Context

Reports and trends need per-comparison outcomes: how many comparisons ran, how
many were changed / unchanged / auto-accepted, how long review and approval
took, and which tests flip between changed and clean. The current schema cannot
answer that:

- A comparison row is deleted when it is approved (the candidate becomes the
  baseline), and the candidate/baseline screenshots are reclaimed.
- `Approval` survives but has no mismatch/outcome and no link to the comparison
  that was reviewed.
- Audit events describe approvals/deletions, not every comparison completion.
- `ComparisonJob` rows are cleaned up after a retention window.

Deriving trends from the live tables would therefore lose history exactly when
it matters (approved changes and reclaimed candidates) and would make trends
depend on job-retention timing.

## Decision

Add a durable, append-only `ComparisonOutcomeEvent` table and write one row per
completed comparison:

- Columns: denormalized `testId`/`testName`, `kind`, `viewport`/`browser`/
  `environment`, optional `comparisonId`/`runId`/`runKey`, `outcome`
  (`changed` | `unchanged` | `within_threshold`), `mismatchMetric`, `createdAt`.
- **No foreign keys.** The row outlives test/branch/run deletion; reports join
  back to the live schema when they need a current name/project, and trend
  queries that join are explicitly scoped by project.
- **Written after the comparison transaction commits**, not inside it. Losing an
  analytics row must never roll back a comparison or block approval; the
  trade-off is that a crash between commit and write loses one data point.
  The write is best-effort and not retried by the worker.
- **Indexed** by `createdAt`, `(testId, createdAt)`, `runKey` and `comparisonId`.
- Reports are built read-only from the run read model + this history; HTML
  reports link to tests instead of embedding presigned screenshots (those URLs
  expire). JUnit maps pending review and failed jobs to `<failure>` so a CI
  viewer agrees with the run gate.
- `Approval` latency is computed by matching `ComparisonOutcomeEvent.comparisonId`
  to `Approval.comparisonId`; flake rate is the share of tests with both a
  changed and a clean outcome in the window.

## Rationale

- One additive table, no changes to comparison/approval semantics.
- Denormalized context keeps old reports readable after a test is renamed or
  deleted (within the retention window).
- Post-commit writes keep the hot comparison path independent of analytics.

## Consequences

- Trends are approximate under crashes and for very old rows whose test was
  deleted (the project-scoped join drops them).
- The table grows with comparisons; a retention task and archive/export are
  future work (R15 owns retention).
- The outcome history is not a replacement for audit: it records comparison
  results, not who approved what.
