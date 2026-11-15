# ADR 081: Internal Maintenance Tasks May Reuse Public Application Services

## Status

Accepted — 2026-11-15. Extends the exception in [ADR-013](./013-backend-structure.md) §1,
which allowed internal modules to import only `VisualTestInfraModule` and its seam
tokens/repository classes. Does not supersede ADR-013: the default direction
(public → internal) and the ban on presentation imports stay as written.

Enforced by: the import list in this ADR, `backend/src/modules/internal/data-deletion/`,
and the fact that no cycle exists (`public/visualTest` imports nothing from
`internal/data-deletion`).

## Context

ADR-013 §1 says internal modules must not import public application services, and
`data-deletion` mostly obeys it: the run, storage-size and orphan sweeps reach the
data through repository classes and the `STORAGE_OBJECT_REFERENCEDNESS` /
`ORPHAN_SWEEP` seams. One sweep does not.

`BranchRetentionTask` deletes idle branches and deliberately reuses
`BranchDeletionService` instead of re-implementing the delete. That is not
laziness: the service owns three guards — the default branch cannot be deleted, a
branch another branch targets cannot be deleted, and a branch with an unreviewed
comparison is refused — plus the job cancellation, the file reclamation inside
the cascade transaction and the audit row. A second implementation would be a
second opinion on when a branch may disappear, which is exactly the class of
divergence this codebase removes rather than documents (see the "one RunState
rule", "one boundary" and "one retirement body" commits).

The alternative the ADR-013 exception implies — put the deletion behind a seam
token provided by `VisualTestInfraModule` — does not fit either:
`BranchDeletionService` depends on `StateChangeWorkflow` (an application
service), so moving its provider into the infra module creates an
infrastructure → application dependency and a module cycle. A token whose only
implementation is the class that cannot move buys indirection, not a boundary.

CONTEXT.md already described the maintenance tasks as crossing a token. That was
true for the repository-based sweeps and false for this one, so the rule and the
code disagreed.

## Decision

Internal maintenance modules may import `VisualTestApplicationModule` and the
specific public application services listed here, in addition to the
`VisualTestInfraModule` exception from ADR-013 §1:

- `internal/data-deletion/tasks/branch-retention.task.ts` —
  `BranchDeletionService` (it owns the delete guards and the cascade).

The list is closed: a new import needs a new entry in this ADR in the same pull
request. The following remain forbidden for every internal module, including the
module above:

- presentation classes (controllers, DTOs, mappers),
- public domain entities and value objects,
- any import that creates a cycle back into `internal/`.

Reuse is allowed only where the public service is the single owner of a rule and
re-implementing it would create a second owner. A service that is merely
convenient to call does not qualify.

## Consequences

The guards a manual branch delete enforces are the guards the sweep enforces,
because there is one implementation. The architecture rule now matches the code:
`CONTEXT.md` states the exception, this ADR records why, and `ADR-013` keeps the
default. The cost is that `data-deletion` is no longer importable on its own
without the visual-test application module — acceptable, since the module only
lives in `WorkerModule`, which imports both.

If a second application service ever needs the same treatment, the seam question
should be reopened rather than growing this list: two entries is a pattern, one
is an exception.
