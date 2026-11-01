# ADR 055: The Frontend Gate Measures What It Runs

## Status

Accepted — 2026-11-01. Complements
[ADR-054](./ADR-054-coverage-per-layer-and-real-database-races.md) (which made
the backend gate per-layer and executable) by applying the same rule to the
frontend, and partially supersedes
[ADR-020](./020-testing-strategy.md) where it left the frontend gates unmeasured.

## Context

An audit of the frontend test strategy in November 2026 found that every
individual suite was well built and that most of what was promised in
`docs/testing.md` was true — but that several gates were not measuring what they
claimed, and one could not have run at all.

**The coverage gate never ran locally, and was 30 points too loose.** The
frontend carried `statements: 60, branches: 45, functions: 45, lines: 60` in
`frontend/vite.config.ts` while the suite actually measured 94.1 / 84.5 / 94.1 /
95.6. `scripts/verify.sh` — the gate that runs on every push, because the CI
workflows may be switched off — called `pnpm test -- --run`, never
`test:coverage`. A third of the coverage could disappear without a red gate
anywhere on the developer's machine. This is the same failure ADR-054 recorded
for the backend, one workspace over.

**The a11y gate covered 12 of 21 routes.** The quality suite walks
`QUALITY_CASES`, and the story gallery only had stories for the pages the CT
suite needed. The admin surfaces (users, audit, webhooks, runs, run detail,
trends, security), the share page and the three stand-alone screens (login,
forbidden, change password) were reached by the e2e suite only — which
photographs nothing and scans nothing. Nothing failed when a page was added
without a case, so the gap widened silently.

**Axe scanned pages at rest.** Every case waited for a populated state and then
ran the scan; no dialog, dropdown, command palette or toast was ever scanned, so
the pattern that most often breaks (focus trap, `aria-modal`, focus return) was
invisible to the gate. Across all browser suites there were five `.press()` calls
and not a single focus assertion.

**Three smaller wiring defects of the same kind:**

- `tests/e2e/**` and both Playwright configs were missing from
  `frontend/tsconfig.playwright.json`, so ~2.900 lines of e2e code were never
  type-checked.
- `ci-frontend.yml` ran the a11y step with `QUALITY_PLATFORM: linux/arm64`
  against an image built and loaded as `linux/amd64`. The step cannot resolve
  against a single-arch image; because no local gate runs the quality suite, it
  went unnoticed.
- The i18n parity check existed only in CI, not in the local gate.
- Every browser-suite fixture was hand-written JSON behind
  `FulfillResponse = { body: string }`, so a rename in DTOs produced `undefined`
  in the UI and left the screenshot green.

## Decision

1. **The frontend coverage gate is per layer and ratcheted.** Thresholds are set
   per directory (`domains`, `composables`, `lib`, `i18n`, `components`) at the
   measured value minus 1-2 points, plus a global floor. A number is raised after
   a gap is closed and never lowered to make a red run green. `scripts/verify.sh`
   runs `test:coverage`, so the gate is checked on every push.
2. **`src/router/index.ts` leaves the denominator.** It is wiring — a route table
   plus `createRouter` — whose guards are tested through `lib/auth-guard` and
   `lib/route-focus`, and whose invariants are asserted by
   `src/__tests__/gallery-coverage.test.ts` and `router-*` tests. Its lazy
   `component: () => import(...)` entries cannot execute under Vitest, so keeping
   it in scope only caps the layer with a number about nothing.
3. **Gallery coverage is enforced.** `src/__tests__/gallery-coverage.test.ts`
   requires every named route to be either backed by a quality case or listed as
   an opt-out with a reason. A new route fails the unit suite until the author
   makes that decision; the opt-out list is where the remaining gap is visible
   instead of implied.
4. **The gate can run the whole pyramid.** `scripts/verify.sh --with-browser`
   adds the CT suite, `--with-quality` adds visual + a11y in the quality image.
   The default stays fast, but "the gate" is no longer only the layers that need
   no browser.
5. **`scripts/quality.sh` refuses a platform mismatch** before a `--no-build`
   run, so an image built for one architecture cannot be run as another.
6. **Keyboard operation and focus management are part of the CT suite**
   (`tests/ct/keyboard.spec.ts`): focus enters a dialog, Escape closes it, focus
   returns to the trigger, the palette takes and restores focus, the first Tab
   stop is a real control. Axe remains the floor for the at-rest page; it is not
   the accessibility strategy.
7. **Browser fixtures are bound to the generated SDK types**
   (`src/__tests__/fixtures-contract.test.ts`), so a DTO drift becomes a
   type-check failure instead of a plausible-looking screenshot.
8. **`tests/e2e/**` and every Playwright config are type-checked** by
   `pnpm typecheck`, and the i18n parity check is part of the local gate.

## Consequences

- A frontend change that drops coverage below a layer's number fails the push
  hook, not a CI job that may not run.
- Adding a page now has a decision attached: a gallery case (fixture + story +
  case entry) or an opt-out line with a reason. Both are reviewable.
- Two routes remain out of the gallery on purpose (share, run detail); the
  reason is in code, next to the routes it describes, not in this ADR.
- `docs/testing.md` and `frontend/AGENTS.md` describe the gates that exist; when
  a gate moves, the document moves with it.
- The quality suite is still one viewport, one browser and `en-US` only. That is
  a recorded limitation, not an oversight: adding a second project is a
  deliberate cost decision, and the visual baselines remain Linux amd64.
