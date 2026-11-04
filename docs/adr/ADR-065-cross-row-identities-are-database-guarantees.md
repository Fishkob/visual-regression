# ADR 065: Cross-row identities are database guarantees

## Status

Accepted — 2026-11-24. Changes the rule in [CONTEXT.md](../../CONTEXT.md)
"Implementation Notes" that named these identities application-enforced.

Enforced by the five triggers in
`backend/prisma/migrations/20261124104000_cross_row_identity_triggers` and by
`cross-row-identity.e2e-spec.ts`, which inserts every inconsistent shape against
the real database and expects the rejection.

## Context

Six columns name another row's owner a second time:

| Column                     | Must equal                          |
| -------------------------- | ----------------------------------- |
| `UnifiedScreenshot.testId` | its variant's `testId`              |
| `UnifiedComparison.testId` | its baseline's `testId`             |
| `UnifiedComparison.testId` | its candidate's `testId` (when set) |
| `Run.projectId`            | its branch's `projectId`            |
| `Branch.targetBranchId`    | a branch of the same project        |
| `Project.defaultBranchId`  | a branch of the same project        |

CONTEXT.md listed them as application-enforced, with a real reason: Prisma cannot
model a composite foreign key without adding a redundant scalar column per
relation, and a hand-written constraint is dropped as drift by the next
`prisma migrate dev`. [ADR-063](ADR-063-single-pending-comparison-is-a-database-guarantee.md)
had already answered the same objection for the single-pending rule: triggers are
invisible to the schema diff and therefore survive regeneration.

The failure the list was tolerating is silent, not loud: a comparison whose
baseline belongs to another test renders one test's evidence under another test's
review page; a screenshot under a foreign variant is unreachable from its own
test's gallery but counted by the other test's readers; a run in the wrong
project shows up in the wrong CI gate. None of these produce a 500 — they produce
a plausible-looking answer.

## Decision

**Each of those identities is a `BEFORE INSERT OR UPDATE OF <columns>` trigger
that raises SQLSTATE `23514` with the two ids in the message.**

- One indexed primary-key lookup per write — the same cost a foreign key would
  have paid, and the columns that make the writes hot (screenshot, comparison)
  already pay several.
- No advisory lock: unlike the single-pending rule (ADR-063), this is a
  single-row comparison against a row that must already exist for the insert to
  be meaningful. There is no read-then-write against a set.
- The migration fails an upgrade that already carries a mismatch, with the table
  and the fix in the message, instead of accepting the DDL and failing on the
  next write to an old row. Nothing is auto-repaired: a violating row needs a
  human who knows which side is right.
- `NULL` is legal wherever the column is nullable: `candidateId` is detached when
  a PDF approval retains a comparison, `targetBranchId` is `NULL` for "the
  project's default branch", and both `ON DELETE SET NULL` updates pass through
  the trigger unchanged.

**Named exception: `UnifiedVariant.baselineId` may point at a screenshot of
another test.** The PDF download guards answer `403` for exactly that state, and
`pdf-test-queries.e2e-spec.ts` builds it to exercise them (`adoptBaseline: false`).
A constraint would make the guard unreachable from a test that also runs against
the real database — the guard is defense in depth against a row that is already
wrong, and it needs to be feedable. This exception is the one place where the
application, not the database, is the owner.

## Alternatives Considered

- **Composite foreign keys with a redundant column** (`UnifiedScreenshot(testId,
variantId)` → `UnifiedVariant(testId, id)`). Correct, but it multiplies columns
  on the three hottest tables and still needs a unique index per target; the
  triggers state the rule without changing a single table's shape.
- **`CHECK` constraints.** A `CHECK` cannot read another row.
- **Application-only enforcement (status quo).** It was documented, not enforced;
  the failure mode is a wrong answer, not an error.
- **Enforce `UnifiedVariant.baselineId` and change the two PDF tests.** Rejected:
  it would delete the end-to-end proof of a user-visible `403` to gain an
  invariant the write path never violates.

## Consequences

- A corrupted cross-row reference is now an error at the write that caused it,
  not a review page that shows the wrong test.
- Every schema change to those five tables must not drop the triggers; they are
  named `<Table>_<rule>` and documented in the migration header.
- A future writer that legitimately needs one of these to differ (for example a
  branch that inherits from another project) has to make that a decision, not an
  accident.
