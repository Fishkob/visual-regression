# ADR 064: The discussion cascades with its test

## Status

Accepted — 2026-11-24. Supersedes the `ReviewComment` cleanup half of
[ADR-042](ADR-042-review-artifact-lifecycle.md); the vote half was already
superseded by [ADR-050](ADR-050-approval-votes-are-audit.md).

Enforced by `cross-row-identity.e2e-spec.ts` ("deletes the comments with their
test") against the real database: the row is gone after the test delete, and the
case fails without the foreign key.

## Context

`ReviewComment` was created without a foreign key, and [ADR-042](ADR-042-review-artifact-lifecycle.md)
compensated with two mechanisms: `TestDeletionService` deleted the comments by
hand inside its own transaction, and `ReviewArtifactCleanupTask` swept whatever an
older or concurrent path had already orphaned. [ADR-050](ADR-050-approval-votes-are-audit.md)
narrowed the sweep to comments only.

The reasoning in the code did not match the behavior. The repository comment said
the discussion "deliberately carries no foreign key … so a test/project delete
would silently leave the discussion behind", while the very next service call
deleted it in the same transaction — and CONTEXT.md states the rule as "test and
project deletion remove the comments in the same transaction". The row was not
meant to outlive its test; only `comparisonId` was, because approval deletes the
comparison row while the discussion that led to it must survive.

So one invariant ("the discussion dies with its test") was held by a hand-rolled
delete per call site, a project-name backstop, a daily bounded sweep, an advisory
lock id and two metrics — and a path that forgot the delete produced a row no
reader could reach.

## Decision

**`ReviewComment.testId` is a foreign key to `UnifiedTest` with `ON DELETE
CASCADE`; `comparisonId` keeps no foreign key.**

- The cascade removes the comments with the test, the branch and the project, in
  the same transaction as the delete — the branch cascade is the case the sweep
  existed for and could never name ("the test is already gone").
- `TestDeletionService` no longer deletes comments, and `ReviewArtifactRepository`,
  `ReviewArtifactCleanupTask`, its lock id (`1010`) and its two metrics are
  removed. A mechanism that guards an unreachable state is a mechanism nobody can
  test.
- The migration deletes the orphans first: with the constraint in place they are
  unrepresentable, and they were exactly the rows the sweep was cleaning up.

## Alternatives Considered

- **Keep the sweep next to the foreign key.** A daily task whose query can never
  match is dead code with a lock, a metric and a cron slot; the repository's
  "single owner" rule would have two owners that can never disagree.
- **Keep the repository delete as well.** The cascade runs in the same `DELETE`;
  a second statement buys nothing and keeps the false "no FK" comment alive.
- **A foreign key on `comparisonId` too.** Rejected for the reason it was
  originally left out: approval and threshold auto-accept delete the comparison,
  and the discussion must outlive that row.

## Consequences

- The only way to leave a comment without a test is to drop the table.
- Deleting a test, a branch or a project is one statement; no call site has to
  remember the comments.
- One fewer maintenance task, lock id and metric; `docs/observability.md` and the
  dashboard queries lose nothing else because no dashboard referenced them.
- The e2e reset still clears comments explicitly — it should not depend on a
  constraint to be complete.
