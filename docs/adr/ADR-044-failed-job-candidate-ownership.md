# ADR 044: A Failed Job Owns Its Candidate

## Status

Accepted — 2026-10-26

## Context

The daily orphan sweep treats a `CURRENT` screenshot row as garbage when no
`UnifiedComparison` references it as a candidate and no `ComparisonJob` names it.
It only counted `PENDING` and `PROCESSING` jobs as naming a row, so the candidate
of a **`FAILED`** job looked like an orphan.

That candidate is not garbage. `FailedJobStore.retry` flips the same row back to
`PENDING` and the worker re-downloads the payload's frozen candidate URL, so the
stored object is the retry's input — and the forensic evidence of the failure.
`FailedJobCleanupTask` already treats it that way: row first, then the file, only
after `JOB_RETENTION_DAYS` (7 by default).

The sweep also runs **earlier in the same cron pass** than that task, and it
deletes the object _before_ the row. A failed comparison therefore lost its
candidate up to a week before the retention window opened, and an operator's
retry then did not fail loudly: the download 404s, the processor retires the
candidate as moot and marks the job `COMPLETED`. The operator's `204` was a
silent no-op.

## Decision

`FAILED` is a candidate-owning status. The statuses are one constant,
`CANDIDATE_OWNING_JOB_STATUSES`, in `orphaned-screenshot.repository.ts`, used by
the find, the delete-time guard and the NULL-`candidateId` skip. A candidate a
`FAILED` job still names is never swept; its retention belongs to
`FailedJobCleanupTask` alone.

## Alternatives considered

- **Extend `Project.orphanGraceHours` to `CURRENT` rows.** Rejected: it does not
  fix the defect (the failed-job retention window is a different, longer clock),
  and `UnifiedScreenshot` has no `updatedAt` — an in-place re-adoption keeps the
  original `createdAt`, so an age predicate would classify a freshly re-adopted
  in-flight candidate as old.
- **Delete from a re-checked snapshot.** Kept as-is instead: the storage delete
  still runs on a find-time snapshot, which is safe only because object names are
  unique per upload, so the deleted object is always the superseded one.

## Consequences

- The failed-job candidate's object no longer disappears a week early; it is
  reclaimed by the task that knows the retention window.
- A legacy pre-backfill job with a NULL `candidateId` now also blocks the CURRENT
  sweep when it is `FAILED`, not just while it is in flight. The skip is logged as
  a warning and the sweep reports zero — visible in the metrics, and fixable by
  backfilling the column (see CONTEXT.md "Deploy note (job-queue columns)").
- The failure rate of the CURRENT sweep may drop to zero on a deployment that
  never backfilled; the BASELINE sweep is unaffected.
