# Testing

How the test suites are laid out today, and where their moving parts live. The
decision behind this layout — and the alternatives it rejected — is in
[ADR-020](adr/020-testing-strategy.md), which also says where a new test belongs.

## Suites

| Suite                                         | Runner             | What it covers                                                                                                                                    | Infrastructure                                    | Speed  |
| --------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| **Unit** (`*.spec.ts`)                        | Vitest             | Business logic, domain rules, service orchestration; all infrastructure mocked                                                                    | none                                              | fast   |
| **Backend E2E** (`*.e2e-spec.ts`)             | Vitest + supertest | Full HTTP round-trip: controller → pipes → guards → interceptors → service → repository → real Postgres/RustFS/sidecar                            | Postgres, RustFS, pdf-sidecar                     | medium |
| **Frontend E2E** (`frontend/tests/e2e/`)      | Playwright         | Real user flows: upload → navigate → review → approve                                                                                             | the full stack                                    | slow   |
| **Component** (CT, `frontend/tests/ct/`)      | Playwright         | One Vue page in a real browser, rendered through the story gallery; keyboard operation and focus management included                              | Vite dev server                                   | medium |
| **Visual / A11y** (`frontend/tests/quality/`) | Playwright         | Every gallery case in light and dark: a committed screenshot baseline plus an axe WCAG A/AA scan; overlay cases are opened first and scanned only | the quality image (`frontend/Dockerfile.quality`) | medium |

There is no integration-test suite. A repository test against real Postgres
without HTTP existed once and was dropped on 2026-07-25;
[ADR-020](adr/020-testing-strategy.md#no-integration-tests) records why and what
would bring it back. [ADR-054](adr/ADR-054-coverage-per-layer-and-real-database-races.md)
adds the one exception: a test in `test/e2e/` may drive a service or a queue from
the running application when the property under test is a database guarantee
(lock behaviour, a unique index, transaction isolation). Two requests arriving at
the same time cannot be produced through the HTTP surface, and a mocked client
cannot hold a lock.

One component is outside every suite: `pdf-sidecar/` (Java 25) ships two JUnit
classes that nothing runs — the quality image, the CodeQL build and the Docker
build all pass `-DskipTests`, and no job calls `mvn test`. The sidecar is
exercised only black-box, through the backend e2e suite's PDF flows, so a unit
regression in `PdfCompareService` is caught by the pixels it produces, if at
all. Turning those tests on is a CI job away, but it needs one local
`mvn -B test` first: they have never run, and a gate on an unverified suite is
worse than the gap.

## How the suites are wired

- **Backend unit** — `Test.createTestingModule()` with providers replaced by
  `createMock<X>()`; no database, no network. Idioms and conventions live in
  [`backend/AGENTS.md`](../backend/AGENTS.md).
- **Backend E2E** — a real app instance against real Postgres, RustFS and the PDF
  sidecar from Compose; `pnpm run e2eTest` brings them up.
- **Frontend unit** — Vitest + jsdom + `@vue/test-utils`; SDK calls are mocked
  with `vi.mock('@sdk/...')` and a fresh TanStack `queryClient` per test. Idioms
  live in [`frontend/AGENTS.md`](../frontend/AGENTS.md). The suite also carries
  four cross-cutting invariants: `gallery-coverage.test.ts` (every route has a
  quality case or a documented opt-out), `fixtures-contract.test.ts` (every
  browser fixture is bound to the generated SDK type), `route-invariants.test.ts`
  (every route has a title key that exists in both locales, the public and admin
  route sets are pinned, and every view has a browser spec or its own) and
  `invalidation-contract.test.ts` (every helper in `src/lib/invalidation.ts`
  refreshes the reads it owns, checked against a seeded `QueryClient` so the
  framework's prefix matching decides).
- **Frontend E2E** — Playwright against a running frontend.
- **Component and quality suites** — both read the **story gallery**: a Vite page
  (`frontend/playwright/gallery/`) that resolves `*.story.ts` files through
  `import.meta.glob` and exposes `window.mount`/`window.unmount`. CT specs drive
  it through Playwright's `mount` fixture; the quality suite walks every case in
  both themes. `tests/quality/cases.ts` is the list the visual and a11y specs
  share, so a case gets a baseline and a scan at the same time.

## Gallery coverage

`tests/quality/cases.ts` holds one case per page the gallery can render: a story
id, the API mocks it needs, a `readyTestId` the shot waits for, and optional
masks. Both quality specs iterate the list, so a case is photographed and scanned
in light and dark at once. The cases cover **every route** in
`src/router/index.ts`: the review surfaces, the admin pages, the three stand-alone
screens (login, forbidden, change password), the public share page and the run
detail. The fixtures for the pages the gallery reaches only through it live in
`tests/quality/mocks/pages.mocks.ts`.

`src/__tests__/gallery-coverage.test.ts` requires every route to be either backed
by a case or listed in that test as an opt-out with a reason. That opt-out list is
empty today: the last two entries — the share page and the run detail — got
fixtures, so a layout or axe regression there is gated like everywhere else.
Adding a route therefore fails the unit suite until the author either writes a
case or records why not.

## Frontend E2E coverage

Every user-facing feature area has a Playwright spec under
`frontend/tests/e2e/`. A spec creates its own uniquely named project (and
group/user/key where needed) through `fixtures/api.ts`, drives the real UI, and
cleans up in `afterEach`; API calls that need a browser session use
`loginSession()` instead of the project API key.

Repeated interactions live in `fixtures/ui.ts` (`expectToast`, `confirmDialog`,
`byText`); `fixtures/auth.ts` holds `loginAs`/`loginAsAdmin` and is the only
place that knows the admin credentials. Assertions carry no timeout of their
own — `playwright-e2e.config.ts` sets one 10s expect timeout for the suite.

| Area                                                                               | Spec                              |
| ---------------------------------------------------------------------------------- | --------------------------------- |
| Review loop, skip, approve, done page                                              | `image-review-workflow.spec.ts`   |
| PDF compare, downloads, approval, diff reclamation                                 | `pdf-comparison-workflow.spec.ts` |
| Inbox entry/return                                                                 | `review-inbox.spec.ts`            |
| Inbox bulk approve, project bulk move                                              | `bulk-actions.spec.ts`            |
| Comments: create, filter, resolve, reload, inherited read-only                     | `comments.spec.ts`                |
| Test metadata: rename, description, tags, size policy, mute/unmute, delete variant | `test-lifecycle.spec.ts`          |
| Threshold edit, auto-accept confirmation, invalid input                            | `threshold.spec.ts`               |
| Baseline history + restore, inherited read-only                                    | `baseline-history.spec.ts`        |
| Branch switch, inherited baseline, retarget, default, delete guards                | `branches.spec.ts`                |
| Assignments, inbox "my reviews"                                                    | `review-assignments.spec.ts`      |
| Storage usage, retention settings, cleanup preview                                 | `storage.spec.ts`                 |
| Share links: create, passphrase, anonymous read, revoke                            | `share-links.spec.ts`             |
| API keys: create, use, delete                                                      | `api-keys.spec.ts`                |
| Users: create, reset, deactivate/reactivate, forced password change, viewer gating | `users.spec.ts`                   |
| Sessions list/revoke                                                               | `security.spec.ts`                |
| Audit filters and CSV export                                                       | `audit.spec.ts`                   |
| Webhooks: create, edit, activate, test, deliveries, replay, delete, SSRF rejection | `webhooks.spec.ts`                |
| Runs: list/detail, approve all, finish, JUnit/HTML/CSV reports                     | `runs.spec.ts`                    |
| Capture upload: browser screenshot → baseline, identical, pending review           | `capture-upload.spec.ts`          |
| Trends metrics and range switch                                                    | `trends.spec.ts`                  |
| Variant gallery, overview page, PDF overview note                                  | `test-overview.spec.ts`           |
| Global search, theme persistence, locale switch, logout                            | `search-theme-locale.spec.ts`     |
| Project list/search/filter, group CRUD, project move/delete                        | `groups-projects.spec.ts`         |
| Navigation and 404                                                                 | `navigation.spec.ts`              |

## Backend E2E coverage

`backend/test/e2e/**/*.e2e-spec.ts` covers the HTTP surface the frontend E2E
cannot reach cheaply: API-key scopes and lifecycle, roles, users administration,
audit export, review comments/assignments, thresholds, baseline
history/restore, branch management, variants/pending meta, runs and reports,
share links, webhook management/delivery/replay, storage/quota, PDF pipeline and
maintenance sweeps. Each spec resets the `vrt_e2e` database and calls the real
app through supertest.

Some of them assert a database or filesystem guarantee rather than an HTTP
contract, because the HTTP surface cannot produce the input — or because the
mechanism only shows itself when real rows are at stake. They drive the running
app instead:

| Spec                                               | Drives                                                               | Cases |
| -------------------------------------------------- | -------------------------------------------------------------------- | ----: |
| `job-queue-concurrency.e2e-spec.ts`                | the queue: concurrent claims, stall reclaim, ownership loss, backoff |    10 |
| `concurrent-review.e2e-spec.ts`                    | two racing uploads and two racing approvals                          |     2 |
| `pending-comparison-invariant.e2e-spec.ts`         | the advisory lock behind "one reviewable comparison per variant"     |     4 |
| `notifications/webhook-delivery-lease.e2e-spec.ts` | the webhook lease: concurrent claims, a live lease, an expired one   |     3 |
| `data-deletion/outcome-retention.e2e-spec.ts`      | the destructive outcome sweep against real rows                      |     5 |

That is 24 cases, and each was checked to fail when its mechanism is removed:
a spec that stays green after the `FOR UPDATE`, the lock or the batch loop is
removed proves nothing. They are the exception
[ADR-054](adr/ADR-054-coverage-per-layer-and-real-database-races.md) allows and
the evidence [ADR-059](adr/ADR-059-query-policy-vs-mechanism.md) points at when it
forbids a unit test to assert a locking mechanism. Two of them are there for the
reason one level up: a unit spec pins the cutoff or the statement they _ask for_,
which would stay green if a comparison were off by a timezone, if the
`deleteMany` matched nothing, or if the batch loop stopped one pass early — the
ways a retention task silently keeps or loses history; and a string test on
`FOR UPDATE SKIP LOCKED` stays green for the claim that has no lock at all.

The race case is also why the last mechanism assertion is gone from the unit
suite. `webhook-delivery.repository.spec.ts` used to check the claim SQL for
`FOR UPDATE SKIP LOCKED` under an `eslint-disable-next-line`, because no
concurrency case existed for the lease. `webhook-delivery-lease.e2e-spec.ts`
now drives 24 concurrent claims and fails with duplicate ids — 24 claims
returning 6 distinct rows — when the clause is removed, so the string assertion
had nothing left to prove and is deleted.

`health/boot-smoke.e2e-spec.ts` covers the other gap: every other spec boots the
hand-built `TestApp`, which re-states the global prefix and the validation pipe
and skips the rest of `bootstrapApi` — trust proxy, the body-size limits, helmet,
CORS, the Swagger gate, `listen`. The smoke test starts the **production**
`bootstrapApi` on an ephemeral port and asserts those, including that an
oversized body on `/api/v1/log` is answered with 413. `src/bootstrap.ts` is
excluded from the unit gate for that reason, like `src/main.ts`.

## Gates

- The backend unit run enforces **one coverage threshold per architectural
  layer** (`backend/vitest.config.ts`): domain, common, application,
  infrastructure and internal are held separately, and `**/presentation/**` is
  outside the unit gate because the HTTP suite owns it. A number is raised after
  closing a gap and never lowered to make a red run green. The rule and its
  numbers came from [ADR-054](adr/ADR-054-coverage-per-layer-and-real-database-races.md).
- `scripts/verify.sh` runs the gated variant (`unitTest:cov`), so the numbers are
  checked on every push — the reason the previous global threshold sat red
  unnoticed was that the local gate ran `unitTest` without coverage.
- The e2e run writes its own map (`coverage/e2e`). `pnpm run coverage:all` runs
  both suites and merges the maps per file; `backend/scripts/merge-coverage.mjs`
  fails on two different gaps — a file with statements that one suite loads and
  never executes, and a file that **neither map contains at all**. The second is
  the one the first cannot see: an unreached file is simply absent, so the
  percentage over the remaining set looks healthy. The check walks `src/`
  instead of trusting the maps, and skips only what no configuration
  instruments (module wiring, type modules, the entry points).
- CI runs that merge as a gate: the backend e2e job runs its suite with
  coverage, re-runs the unit suite (~20 s, cheaper than shipping the map
  between jobs) and merges. Locally it stays an on-demand report, because the
  e2e half wants Docker and ~3 minutes.
- The frontend unit run is gated the same way (`frontend/vite.config.ts`):
  `domains`, `composables`, `lib`, `i18n` and `components` each carry their own
  numbers plus a global floor, and `scripts/verify.sh` runs `test:coverage`, not
  the un-gated variant. `src/router/index.ts`, `src/views/**` and `.vue`
  components stay outside the denominator — the router is wiring whose guards
  have their own tests, the views are covered by the CT suite. A number is raised
  after closing a gap and never lowered. See
  [ADR-055](adr/ADR-055-the-frontend-gate-measures-what-it-runs.md).
- A repository unit test asserts the **visibility policy** the query encodes —
  which rows are in scope, in what order, up to what bound — and not the
  mechanism behind it. Locking and isolation are proved in `test/e2e/`, because a
  string assertion survives exactly the bugs it is meant to catch. The line and
  its one exception: [ADR-059](adr/ADR-059-query-policy-vs-mechanism.md).
- The numeric thresholds live in the configs, one block per layer, and each is
  the measured value of its layer minus 1-2 points. They are not repeated here:
  a copy is a second number that will be wrong. Re-measure when you touch a
  config — a gate that sits far below its layer was widened silently, not
  set generously.
- The backend test tree is linted like `src/` (`lint:check` covers
  `{src,test}/**/*.ts`). A few rules are relaxed for test doubles — non-null
  assertions, void-returning mocks, unsafe assignment; `no-explicit-any` is
  **on**, so a fixture names the type it stands in for. One rule is specific to
  it:
  `local/no-locking-clause-assertions` rejects a locking token inside a
  `toContain` / `toMatch` literal in `test/unit/` — the mechanism half of
  [ADR-059](adr/ADR-059-query-policy-vs-mechanism.md), enforced instead of
  remembered. It has no exceptions left: the one it was written around (the
  webhook lease) now has a race case in `test/e2e/`.
- The pre-commit hook runs the unit tests of the workspace whose files changed
  (`lint-staged`), without coverage — the gate is the push hook.
- The client SDK is gated as an **artifact**, not only as source:
  `scripts/verify.sh` builds it, packs the tarball, installs it into an empty
  project, imports every subpath in Node ESM and type-checks a consumer. A
  package that a consumer cannot load fails the push instead of the release —
  see [ADR-056](adr/ADR-056-client-sdk-distribution.md).
- The visual and a11y baselines are Linux amd64. Regenerate them with
  `./scripts/quality.sh visual --update`, and do not change the platform without
  regenerating every snapshot — see [`frontend/AGENTS.md`](../frontend/AGENTS.md);
  `quality.sh` refuses a `--no-build` run whose image has another architecture.
  `toHaveScreenshot` tolerates 0.01% differing pixels (anti-aliasing noise on
  glyph and border edges), which is orders of magnitude below any layout change.
- The quality suite is `en-US`, one 1440x900 viewport, Chromium only. A case is
  either photographed and scanned, or — when it is an overlay — scanned only,
  with the reason recorded in `scanOnly`: the page beneath already carries a
  baseline, and what an overlay breaks is labelling, `aria-modal` and contrast.
  An overlay case declares `openTestId` (the control that opens it) and
  `overlayTestId` (what proves it is open); the type no longer allows one
  without the other. Three overlay patterns are covered this way: a form dialog,
  the command palette and the retention dry-run dialog.
- Contrast inside an overlay is **measured, not inferred**: axe files every text
  node in a `position: fixed` dialog as `incomplete` ("background color could not
  be determined"), which the page cases treat as blocking. `tests/quality/contrast.ts`
  resolves the nearest opaque background through a canvas (Tailwind v4 emits
  `oklch()`, which a naive `rgb()` parser silently drops) and computes the WCAG
  ratio. It fails below 4.5:1 (3:1 for large text) and also fails when it cannot
  resolve a background or measure nothing at all — the two ways such a check
  goes quietly green.
- Keyboard operation and focus are the CT suite's job
  (`tests/ct/keyboard.spec.ts`). The two layers are complementary: axe reads the
  open overlay's semantics, the CT spec drives its keyboard behaviour — focus
  moves in, Tab stays inside, a nested overlay closes before its parent, Escape
  closes, focus returns to the trigger.
- Covered today: the create-project, invite, rename, API-key rotation,
  bulk-delete and share dialogs, the branch-target dialog together with the
  select inside it, the retention dry-run dialog and the search palette (which
  also covers opening from its keyboard shortcut).
- **Not yet covered**, each because it opens through a write or a table row and
  needs its own fixture: the bulk-failure, baseline-preview, webhook-secret,
  assign-review, approval-decision and storage-edit dialogs, the row-action menus
  (`UserRowActions`, `RowActionsCell`, `BranchActionsMenu`) and the standalone
  `Select` comboboxes outside the branch dialog. Adding one is a row in
  `tests/ct/keyboard.spec.ts`, not a new pattern.

## Commands

`pnpm run unitTest`, `pnpm run unitTest:cov` (the gated variant),
`pnpm run e2eTest`, `pnpm run coverage:all` (both suites, merged),
`cd frontend && pnpm test`, `cd frontend && pnpm test:coverage` (the gated
variant), `cd frontend && pnpm test-ct`, `cd frontend && pnpm test-e2e`,
`cd frontend && pnpm i18n:check`, `pnpm run sdk:pack` (the SDK release
artifact), and `./scripts/quality.sh visual|a11y`.
`./scripts/verify.sh --with-browser --with-quality` runs the browser suites
through the same gate. The one-line description of each is in
[AGENTS.md](../AGENTS.md#testing).
