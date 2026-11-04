# ADR 063: The database enforces "one reviewable comparison per variant"

## Status

Accepted — 2026-11-24.

Enforced by `pending-comparison-invariant.e2e-spec.ts`: a second pending row is
rejected, two concurrent creates produce exactly one row, and a retained
approved row may sit next to one pending row.

## Context

The "at most one reviewable comparison per Variant" invariant has one owner:
`ComparisonRetirementService` retires the superseded comparison before the new
one is written. That ordering is correct inside one transaction, but it is a
read-then-write: two workers (or an upload racing the diff worker) can both see
"no pending comparison" under READ COMMITTED and both commit. The failure is
silent — the inbox then lists two reviewable rows for one variant, and approving
one leaves the other pointing at a baseline that no longer exists.

The obvious database guarantee is a partial unique index:

```sql
CREATE UNIQUE INDEX ... ON "UnifiedComparison"("baselineId")
  WHERE status = 'PENDING_APPROVAL';
```

Prisma cannot model a partial index. `prisma migrate dev` diffs the schema
against the migrations, sees an index it does not know, and would emit
`DROP INDEX` on the next migration — a guarantee that silently disappears the
next time someone edits the schema. A full unique index is wrong for the same
reason a partial one is needed: approved PDF comparisons are retained as history
and share their baseline with later comparisons.

## Decision

**A `BEFORE INSERT OR UPDATE` trigger enforces the invariant, and it takes an
advisory lock on the baseline first.**

- `enforce_single_pending_comparison()` runs only for `PENDING_APPROVAL` rows.
  It takes `pg_advisory_xact_lock(hashtextextended(baselineId, 0))` and then
  checks for another pending row on that baseline, raising SQLSTATE `23505` with
  a hint.
- The advisory lock is what makes it a guarantee rather than a better check: the
  second transaction waits for the first to commit and then sees its row. A
  plain `EXISTS` check in a trigger would have the same READ COMMITTED race as
  the application code.
- It runs as a trigger, not an index, because Prisma does not model triggers: the
  schema diff leaves them alone, so the guarantee survives `prisma migrate dev`,
  `prisma generate` and a future schema edit.

The trigger is a backstop, not the retirement mechanism. The service still
retires first (and owns the candidate/job/storage cleanup); the trigger only
rejects the case the service did not see.

## Consequences

- Two concurrent workers for one variant converge to one pending row; the loser
  fails with a unique-violation-shaped error instead of committing a duplicate.
- Approved (retained, PDF) comparisons are unaffected, and a variant can have
  any number of them plus one pending row.
- The duplicate error is a constraint error to the application, not a domain
  error: callers that retry a job (the queue's retry policy) handle it like any
  other failed attempt. The retirement path runs before the insert, so the
  normal flow never sees it.
- Like the project-id triggers (ADR-061), it is invisible to the Prisma schema.
  A migration that rewrites `UnifiedComparison` must keep it; the test above
  fails if it is dropped.
