# ADR 049: Outcome Rows Carry Their Project Name

## Status

Accepted — 2026-11-01. Supersedes the join-back decision in
[ADR-033](./ADR-033-comparison-outcome-history.md).

## Context

`ComparisonOutcomeEvent` is deliberately free of foreign keys so that deleting a
test, branch, run or project does not erase its analytics
([ADR-033](./ADR-033-comparison-outcome-history.md)). The trend and flake queries
still resolved a row's project by joining through the live tree
(`ComparisonOutcomeEvent → UnifiedTest → Branch → Project`).

That join defeats the reason the table has no foreign keys. Deleting a test does
not delete its outcome rows, but the inner join drops them from the per-project
daily counts, the changed/unchanged split and the flake denominator — exactly the
history the FK-free design was meant to preserve. The failure is silent: the
numbers simply get smaller.

## Decision

The project name is denormalized onto `ComparisonOutcomeEvent` at write time.

`ComparisonOutcomeEntry` requires `projectName`, the only writer (the comparison
job processor) takes it from the job payload, and `daily`/`flake` filter
`e."projectName" = $project` without joining anything. `pending` and `approval`
still read live tables (a pending comparison and the approval project name are
both current by definition), and `eventsForTest` stays keyed by `testId`.

The column is nullable: rows written before the migration whose test is already
deleted cannot be attributed to a project and must not block
`migrate deploy`. New rows always carry a value.

## Alternatives considered

- **Keep the join and accept that a delete removes history.** Rejected: it
  contradicts ADR-033's stated purpose and silently changes trend numbers after
  a cleanup.
- **A soft-delete tombstone for tests.** Rejected: it keeps the test row alive
  forever and changes every read path, only to serve one analytics query.
- **Attributing deleted tests at query time from `testName`.** Rejected: names
  are not unique across projects and can be renamed.

## Consequences

- Trends and flake rates stay stable across test/branch/project deletion.
- One more column plus `(projectName, createdAt)` index; the write path already
  knows the project, so no extra query.
- Legacy unattributable rows remain invisible to per-project trends. That is the
  honest answer for a row whose project cannot be reconstructed.
