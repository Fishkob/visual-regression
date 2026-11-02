# ADR 057: Config-as-code thresholds and the project default

## Status

Accepted — 2026-11-21

## Context

A pixel threshold lives on the baseline screenshot of one variant
(`UnifiedScreenshot.pixelDiffThreshold`) and is edited in the review page or via
`PATCH /projects/:project/tests/:test/threshold`. Two gaps follow:

1. Teams keep capture configuration in the repository (`.percy.yml`,
   `lostpixel.config.ts`, Storybook parameters). A tolerance that only exists in
   a dashboard cannot be reviewed with the code, and a fresh environment starts
   with 0 for every variant.
2. A project with one tolerance policy must set it on every variant after the
   first upload. There is no project-wide default.

The governance constraint is the threshold raise: raising it retires the
pending comparisons it now tolerates (auto-accept), so it is an ADMIN action,
audited with the counts (ADR-041). A CI credential must not be able to widen the
review gate — that would let a pipeline approve its own visual changes.

## Decision

- **Project default.** `Project.pixelDiffThreshold` is a nullable project-wide
  tolerance. The effective tolerance of a comparison is
  `baseline.pixelDiffThreshold` when it is greater than 0, else the project
  default, else 0. The rule is one function
  (`effectivePixelThreshold` in `threshold-policy.ts`) used by the worker and
  the review UI. It is set through
  `PATCH /projects/:project/pixel-threshold`, ADMIN-only (role and `admin` API
  key scope), audited `project.pixel-threshold` with old → new.
- **The project default applies prospectively.** It changes what the worker
  tolerates for comparisons that run after the write; it does not retire the
  pendings that already exist. That is why it does not need the auto-accept
  sweep of a per-variant raise. The UI states this.
- **Config-as-code.** A repository file `.vrt.json` carries
  `{ "thresholds": { "<test name>": <pixels> } }`. The Playwright reporter and
  `uploadMany` send the resolved value as the upload's `pixelDiffThreshold`
  field. The server:
  - stores it when the upload creates the baseline (there is no pending row to
    widen yet);
  - on an existing baseline, applies it only when it is **lower** than the
    current value (a tighten cannot auto-accept anything), optimistic on the
    old value so a concurrent ADMIN write wins;
  - ignores a raise (the ADMIN threshold endpoint remains the only path that
    can widen the gate).
    Both writes are audited as `test.threshold` with `source: 'config'` and the
    previous value.
- **No new credential scope.** Config values ride the existing `upload` scope:
  the effective change is a tightening or a baseline-creation value, neither of
  which can clear a review queue.

## Alternatives considered

- **A full project config endpoint (`PUT /projects/:name/config`)** — rejected
  for v1: it duplicates the existing threshold endpoint, needs its own
  authorization story for raises, and would apply to every test at once. The
  upload field covers the repository use case with less surface.
- **Allow config to raise thresholds** — rejected: it would let a CI key
  auto-accept pendings, bypassing the human review gate and ADR-041.
- **Make the baseline threshold nullable** to distinguish "unset" from an
  explicit 0 — rejected for now: it changes every read and every DTO for a
  corner case. The documented consequence is that an explicit 0 inherits the
  project default; a project that needs "no tolerance anywhere" clears the
  default.
- **YAML config** — rejected: the SDK has zero runtime dependencies, and the
  action is bash; JSON needs neither parser.

## Consequences

- A project can adopt a tolerance policy in one place; a repository can carry it
  per test and have it applied when the baseline is created.
- Raising a threshold from a repository file is a silent no-op by design. The
  upload response does not report it; the docs and the settings copy state the
  rule. A future improvement could return `thresholdIgnored: true`.
- `effectivePixelThreshold` reads an explicit 0 as "inherit". Teams that set a
  project default cannot express "this one variant tolerates nothing"; they
  clear the default or raise the variant above zero deliberately.
- The project default is read per comparison job (one indexed lookup); no job
  payload field is added, so a queued job honours a default changed meanwhile.
