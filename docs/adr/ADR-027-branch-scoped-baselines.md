# ADR 027: Branch-Scoped Baselines

## Status

Accepted — 2026-10-24

## Context

The platform originally stored exactly one BASELINE per `(UnifiedTest, Variant)`. Every upload compared against that single baseline, and the next upload superseded any pending comparison. As soon as two Git branches uploaded for the same project, they competed for the same baseline:

- approving a feature-branch screenshot promoted experimental content into the baseline that `main` was compared against;
- two branches uploading the same variant superseded each other's pending comparisons, so reviews silently disappeared;
- there was no way to review a branch's changes in isolation or to tell which branch a pending comparison came from.

The design spec is `docs/superpowers/specs/2026-10-24-branch-support-design.md`; the implementation plan is `docs/superpowers/plans/2026-10-24-branch-support.md`.

## Decision

Tests, baselines, comparisons, review status and thresholds are branch-scoped.

- A `Branch` belongs to a `Project` and owns its `UnifiedTest` rows (`@@unique([branchId, name])`). The downstream chain (variant → screenshot → comparison → status) is branch-scoped by construction, because every test already owns exactly one branch.
- Every project has exactly one default branch, created with the project and backfilled by the migration. Omitting `branch` in an API call means the default branch, so existing upload and read clients keep working.
- A feature branch has exactly one target (explicit, or `null` = "the project's current default branch").
- `BranchBaselineResolver` is the single owner of baseline resolution for a `(branch, test, variant)`:
  - an owned baseline is used as-is;
  - an inherited clone follows the target chain, refreshed lazily on upload while preserving the branch's threshold;
  - a variant without a baseline clones the nearest ancestor's baseline (`UnifiedVariant.isInherited = true`);
  - if the target chain loses its baseline, the clone is pinned (`isInherited = false`) instead of deleted, so a pending comparison never dangles.
- Approval writes the approved candidate into the branch's own baseline and pins the variant. A feature-branch approval never touches the target branch.
- Reads use a recursive-CTE "Branch View" (`BranchTestRepository`) that resolves the effective test set: materialized branch tests plus unmaterialized ancestor tests tagged `origin = "inherited"`. Inherited tests are read-only in the branch context (`409 CONFLICT`); the review inbox lists real pending comparisons with their owning branch instead of reading through. Global search is the second named exception: it is a finder over materialized tests, so a name that exists on two branches is two destinations (the palette navigates with the hit's branch), and a test reachable only as an inherited shadow has no hit of its own.
- Branch lifecycle: archive (uploads rejected), delete (cascades to the branch's tests, cancels pending jobs, reclaims only unreferenced URLs — an inherited clone shares its file with its source), set default (clears the target and pins the branch's variants), retarget (validated for same project, archived target and cycles).

## Deployment

The migration pair is one deploy for the _database_ but a breaking step for the
_server_: `20261024130000_make_test_branch_required` drops `UnifiedTest.projectId`,
so a still-running previous build — which selects and writes that column — fails
on every read and every upload.

**Decision: that break is accepted.** Both files ship in one release, and the
release is not zero-downtime: the previous backend and worker must be stopped
before the migration runs, so the project trades a short service interruption for
not carrying a compatibility column (and a second deploy) through the next
release cycle. Expand/contract was considered and rejected: `projectId` is
derivable from `branch.project`, the platform is pre-1.0, and a
`projectId`-writing build would have to be maintained only to be deleted again.

Operationally this means: the `db-migrate` job is a Helm `pre-upgrade` hook, so
it runs while the old pods still serve — scale the old backend/worker down first
(see `docs/deployment.md`, "Upgrading across a breaking migration"). A short 5xx
window during the swap is accepted. The next breaking migration should follow the
same pattern unless a release actually needs to be rolling.

`UnifiedTest` is the hottest table in the system, so migration 1 needs room:
it backfills every row, builds a non-concurrent unique index and validates a
foreign key inside Prisma's migration transaction, which blocks uploads for its
duration. On a large installation, batch the backfill and build
`UnifiedTest_branchId_name_key` with a hand-run `CREATE UNIQUE INDEX
CONCURRENTLY` outside the migration transaction. Migration 2 makes the NOT NULL
step cheap on purpose (validated CHECK first, then `SET NOT NULL`), because it
runs long after the data is known-clean.

## Consequences

- A feature branch only ever writes its own baseline; the target branch is untouched by a feature-branch approval.
- After the first approval a feature branch compares against its own approved state rather than the moving target. That drift is deliberate — regressions inside the PR are caught — and is visible in the UI through the inherited/owned distinction.
- Merging a branch into the target produces a normal review on the target afterwards (no baseline promotion). Double review is accepted for this iteration.
- Replacing `test.project` with `test.branch.project` touched many read paths; the compiler was the safety net and the Branch View seam centralizes the inheritance logic.
- Shared files: an inherited clone references the same object as its source, so every deletion path keeps using `filterReclaimableUrls`. Deleting a branch that other branches target is refused (`409`, dependants listed) instead of silently re-pointing them at the project default.
- The inherited/owned state is part of the read model (`baselineInherited`, `inheritTarget`), so the drift after a branch's first approval is visible where the diff is reviewed.
- The migration is one ordered step (create `Branch`, backfill `main` per project, add nullable `branchId`, backfill, drop `projectId`, then set `NOT NULL`), keeping old _API clients_ working throughout (server instances are a separate matter — see Deployment).
- Out of scope: promotion/merge of baselines, branch rename, PR/commit metadata, branch-scoped permissions or API keys, auto-archiving and a branch-level threshold.
