# ADR 030: Run Grouping

## Status

Accepted — 2026-10-25

## Context

Every upload is compared immediately against the branch baseline and the
pending comparison replaces the variant's previous one (latest-wins). That is
correct for a single CI job, but a pipeline that uploads twelve captures has no
way to say "these twelve belong to one run", to review them as a unit, or to
gate a pull request on "the run has no pending review". Two parallel jobs on the
same branch overwrite each other's pending comparisons, and the CI action can
only speak about one upload at a time.

ADR-027 deliberately left PR/commit metadata out of the branch slice: a branch
is a long-lived line of development, not a CI run. Run grouping introduces that
metadata at the run level instead.

## Decision

Introduce a `Run` as the CI grouping unit.

- **Model.** A `Run` belongs to one project + branch. A client-supplied `runKey`
  is unique per `(project, branch)` and makes uploads idempotent under a run.
  Optional `commitSha`, `commitMessage`, `ciUrl` and `metadata` JSON are stored
  verbatim. `finishedAt` is null while the run is open.
- **Upload contract.** The upload endpoint accepts optional `runKey`, `commitSha`,
  `commitMessage` and `ciUrl`. When `runKey` is present the run is upserted and
  the job, comparison and approval audit rows carry the `runId`. Omitting
  `runKey` keeps today's behavior exactly.
- **Reads.** List runs, read one run (tests, variants, counts), and read a run
  status for CI. Status is derived from the linked jobs/comparisons, not stored
  as an aggregate. The inbox gains a run filter/badge; the existing
  project/group grouping stays.
- **Finish semantics.** An explicit `POST /projects/:projectName/runs/:runKey/finish`
  closes the run. A maintenance task auto-finishes runs idle for 24 hours so a
  pipeline that crashes does not leave a run open forever.
- **Action.** The composite action gains `run-key` and commit inputs, uploads one
  or more captures into the run, waits for the run, and fails once when the run
  has a pending comparison (instead of once per file). The step summary lists
  the run.
- **Approval scope.** Run-level "approve all pending" is a loop over the run's
  tests with the existing per-test partial-result semantics; it is not a new
  transactional batch.
- **No isolation.** A run does NOT isolate candidates: latest-wins stays, and
  two uploads for the same variant still supersede each other. Per-run candidate
  isolation would require per-run candidate rows and a different baseline
  resolution, which is a much deeper rework. The run is visibility + gating, and
  the limitation is documented.

## Rationale

- `Run` is the smallest model that turns N uploads into a reviewable/gateable
  unit without changing the comparison pipeline.
- Optional linkage keeps every existing client and the current action working
  unchanged.
- Derived status avoids counters that can drift from the comparison rows.
- An explicit finish is deterministic; the idle timeout is only the safety net.

## Alternatives Considered

- **Use the branch as the run.** A branch spans many commits and cannot express
  "this pipeline run". Rejected.
- **Build a full build/attempt model with per-run candidates.** Correct for
  parallel isolation but a fundamental rework of baseline resolution, review
  and retirement. Rejected for v1.
- **Group by commit SHA only.** A commit can be tested by several runs (retries,
  matrix jobs) and a run can span several commits (merge queues). The run key is
  the client's identity; commit metadata is descriptive. Rejected.
- **GitHub App / check-runs.** Requires an app installation and OAuth; the
  action can report a step summary and exit code without it. Deferred.

## Consequences

- Additive schema: `Run` plus nullable `runId` columns on jobs, comparisons and
  approvals (denormalized so history survives row deletion).
- The migration can deploy with pending jobs: `runId` is nullable and defaults
  to null, so in-flight jobs simply have no run.
- Run status reads join the comparison/job tables; pagination and counts must
  come from one query per page, like the existing review reads.
- Run history grows; retention becomes part of R15.
- The action's contract grows (run inputs) while single-file mode stays.
