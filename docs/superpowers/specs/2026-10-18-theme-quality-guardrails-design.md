# Theme Quality Guardrails — Design

Date: 2026-10-18

## Problem

A dark-mode regression shipped in the project list: the sticky project column
rendered dark while the rest of the table stayed white, because `DataTable.vue`
hard-coded `bg-white` instead of using the semantic `bg-card` token. A unit test
guards that one class now, but it checks the implementation rather than the
rendered result and would not catch the next raw colour, low-contrast pair, or
unintended theme change.

The goal is a layered guardrail that catches this class of defect:

1. Raw colour utilities are rejected at authoring time (lint).
2. Every gallery story is scanned for serious/critical accessibility
   violations in both themes (Axe).
3. Every gallery story is compared against a visual baseline in both themes
   (Playwright screenshots).

The work also removes the raw colours that already exist, so the new lint rule
can be enabled without an allowlist.

## Decision

Add a dedicated quality suite (`playwright-quality.config.ts` + `tests/quality`)
with two specs — visual snapshots and Axe scans — covering every gallery story in
light and dark mode. Add a custom ESLint rule that bans raw palette utilities in
favour of semantic theme tokens. Run the quality suite inside a pinned Linux
Docker image locally and in CI, so one committed set of Linux arm64 baselines is
the source of truth. The arm64 choice is deliberate: Chromium crashes under QEMU
when the amd64 image runs on the arm64 development host, and CI uses a native
arm64 runner to match the committed baselines.

## Test architecture

```
frontend/
  playwright-quality.config.ts        # testDir: tests/quality, webServer: pnpm dev
  tests/quality/
    cases.ts                          # 7 stories: id, props, mocks, route
    theme.ts                          # theme setup, reduced motion, stable waits
    visual.spec.ts                    # one screenshot per case × theme
    a11y.spec.ts                      # one Axe scan per case × theme
    __screenshots__/                  # Linux baselines only
```

- Coverage: all gallery stories, each in `light` and `dark` (14 cases):
  `AppShell`, `Projects`, `ProjectDetail`, `VisualTestDetails`,
  `PdfTestDetails`, `ApprovalDone`, `NotFound`.
- `cases.ts` is the single list shared by both specs. It records the story id,
  props, initial route, and the API mocks needed to render it. The specs must not
  duplicate story setup.
- Theme is applied by toggling the `.dark` class on `<html>`, matching
  `useTheme`. `prefers-color-scheme` is not used, because the app themes
  explicitly.
- The gallery fixture (`mount`) is the existing component-test seam; no new
  runtime is introduced.
- `pnpm test-ct` remains the fast, Docker-free component suite. The quality
  suites are separate commands.

## Visual snapshots

- `visual.spec.ts` mounts each case, applies the theme, waits for mocked
  requests and font loading, and asserts a full-page screenshot.
- Fixed viewport: 1440×900. Animations and transitions are disabled; motion is
  reduced via the Playwright context.
- Snapshot path: `tests/quality/__screenshots__/<case>-<theme>.png`. Only Linux
  images are committed.
- Mock data is deterministic (fixed dates, fixed project/test names), so no
  masks are expected. Any future dynamic content must be masked explicitly
  rather than widening the diff threshold.
- `--update` rewrites baselines and is documented as a reviewable change.

## Axe scans

- Dependency: `@axe-core/playwright`.
- Each case × theme runs `AxeBuilder` with tags `wcag2a` and `wcag2aa`.
- The test fails on violations with impact `serious` or `critical`. The failure
  message lists the rule id, impact, help text, and affected selectors.
- Existing serious/critical violations are fixed as part of the change. If a
  violation originates in a third-party primitive with no safe local fix, the
  rule is disabled explicitly in the spec with a comment naming the reason —
  never by lowering the impact threshold globally.

## Token discipline (ESLint)

- A custom rule in `frontend/eslint.config.ts`, following the existing
  `no-text-selectors` pattern.
- Applies to `src/**/*.vue` and `src/**/*.ts`, including
  `src/components/**/ui/**` (the current Vue block ignores that path, so the
  rule needs its own config block).
- Bans raw palette utilities in `class` attributes and in string literals used
  by `cn()`: backgrounds, text, borders, rings, outlines, fills, strokes,
  gradients, and dividers using `white`, `black`, `gray`, `slate`, `zinc`,
  `neutral`, `stone`, and the other Tailwind palette names.
- Semantic tokens remain allowed: `bg-card`, `bg-background`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-muted`, `bg-primary`, etc.

Existing violations are migrated:

| Location                                 | Change                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `ImageDisplay.vue`                       | image surface → `bg-image-canvas`; dots → status tokens; borders/text → semantic tokens |
| `InteractiveImageViewer.vue`             | same as above                                                                           |
| `TestComparisonInfo.vue`                 | `bg-muted`, `border-border`, `text-muted-foreground`, diff → `text-status-danger`       |
| `domains/test-status/display.ts`         | status colours → `status-neutral` / `status-success` / `status-info` / `status-warning` |
| `ApprovalDoneView.vue`                   | check icon → `text-status-success`                                                      |
| `ErrorBoundary.vue`                      | error text → `text-status-danger`                                                       |
| `RowActionsCell.vue`                     | delete action → `text-status-danger`                                                    |
| `PdfPageViewer.vue`                      | load error → `text-status-danger`                                                       |
| `ui/button`, `ui/badge`, `ConfirmDialog` | `text-white` on destructive → `text-destructive-foreground`                             |
| `ui/alert-dialog/AlertDialogContent`     | `bg-black/80` → `bg-overlay/80`                                                         |

New tokens in `frontend/src/style.css`:

- `--image-canvas`: intentionally white in both themes, for image/PDF viewing
  surfaces where the document background must not follow the UI theme.
- `--overlay`: theme-independent black used by modal backdrops.
- `--status-neutral`, `--status-success`, `--status-info`, `--status-warning`,
  `--status-danger`: themed status colours. Light mode uses the 700 step for
  AA contrast on light surfaces; dark mode uses the 300 step. The same tokens
  drive text, borders, and indicator dots so status styling has one source.

`--destructive-foreground` is corrected to a near-white value (it currently
matches the destructive red), so destructive buttons and badges have a readable
foreground token instead of raw `text-white`.

No file-level allowlist is needed. Intentional exceptions become semantic
tokens, so the rule stays strict.

## Docker and CI

- `frontend/Dockerfile.quality`: Node 26, pnpm installed at the version from
  the root `packageManager` field, Playwright 1.64.0 with Chromium and OS
  dependencies. It copies the workspace and installs dependencies inside the
  image; the host `node_modules` is never mounted.
- `scripts/quality.sh [visual|a11y] [--update]`:
  - builds/tags the image;
  - runs the selected suite inside it;
  - with `--update`, bind-mounts only
    `frontend/tests/quality/__screenshots__` so new baselines land in the repo;
  - always bind-mounts `frontend/test-results` and `frontend/playwright-report`
    so failure artifacts survive the container.
- One Linux arm64 baseline set is produced and checked in the same image. CI uses
  a native `ubuntu-24.04-arm` runner and the same image, so font differences
  cannot drift the baselines. The job asserts the runner and image architecture;
  switching to amd64 requires regenerating the baselines.
- CI: a `frontend-quality` job runs both suites after `build`, publishes the
  Playwright report on failure, and uses buildx/GHA cache for the image.
- Developer commands (documented in `frontend/AGENTS.md` and the root
  `AGENTS.md` testing table):
  - `pnpm --filter ./frontend test-visual`
  - `pnpm --filter ./frontend test-a11y`
  - baseline update: `./scripts/quality.sh visual --update`

## Verification

- `pnpm run lint:check` passes with the new rule and migrated colours.
- `pnpm run typecheck` passes.
- `pnpm --filter ./frontend test` passes.
- `./scripts/quality.sh visual` passes twice in a row (baselines committed and
  reproducibly matched).
- `./scripts/quality.sh a11y` passes for all 14 cases.
- The regression from the original bug is covered: the project list baseline in
  dark mode shows the table container and sticky column with the same dark
  surface, and the Axe scan reports no contrast violation.

## Out of scope

- Screenshot tests for the marketing site or PDF sidecar.
- Replacing the existing Vitest/Playwright split.
- Cross-browser visual baselines (Chromium only, matching the existing CT
  suite).
- Per-component theme tokens beyond the two semantic tokens listed above.
