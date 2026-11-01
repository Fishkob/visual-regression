# Testing

How the test suites are laid out today, and where their moving parts live. The
decision behind this layout — and the alternatives it rejected — is in
[ADR-020](adr/020-testing-strategy.md), which also says where a new test belongs.

## Suites

| Suite                                         | Runner             | What it covers                                                                                                         | Infrastructure                                    | Speed  |
| --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| **Unit** (`*.spec.ts`)                        | Vitest             | Business logic, domain rules, service orchestration; all infrastructure mocked                                         | none                                              | fast   |
| **Backend E2E** (`*.e2e-spec.ts`)             | Vitest + supertest | Full HTTP round-trip: controller → pipes → guards → interceptors → service → repository → real Postgres/RustFS/sidecar | Postgres, RustFS, pdf-sidecar                     | medium |
| **Frontend E2E** (`frontend/tests/e2e/`)      | Playwright         | Real user flows: upload → navigate → review → approve                                                                  | the full stack                                    | slow   |
| **Component** (CT, `frontend/tests/ct/`)      | Playwright         | One Vue page in a real browser, rendered through the story gallery; keyboard operation and focus management included   | Vite dev server                                   | medium |
| **Visual / A11y** (`frontend/tests/quality/`) | Playwright         | Every gallery case in light and dark: committed screenshot baselines plus an axe WCAG A/AA scan of the at-rest page    | the quality image (`frontend/Dockerfile.quality`) | medium |

There is no integration-test suite. A repository test against real Postgres
without HTTP existed once and was dropped on 2026-07-25;
[ADR-020](adr/020-testing-strategy.md#no-integration-tests) records why and what
would bring it back. [ADR-054](adr/ADR-054-coverage-per-layer-and-real-database-races.md)
adds the one exception: a test in `test/e2e/` may drive a service or a queue from
the running application when the property under test is a database guarantee
(lock behaviour, a unique index, transaction isolation). Two requests arriving at
the same time cannot be produced through the HTTP surface, and a mocked client
cannot hold a lock.

## How the suites are wired

- **Backend unit** — `Test.createTestingModule()` with providers replaced by
  `createMock<X>()`; no database, no network. Idioms and conventions live in
  [`backend/AGENTS.md`](../backend/AGENTS.md).
- **Backend E2E** — a real app instance against real Postgres, RustFS and the PDF
  sidecar from Compose; `pnpm run e2eTest` brings them up.
- **Frontend unit** — Vitest + jsdom + `@vue/test-utils`; SDK calls are mocked
  with `vi.mock('@sdk/...')` and a fresh TanStack `queryClient` per test. Idioms
  live in [`frontend/AGENTS.md`](../frontend/AGENTS.md). The suite also carries
  two cross-cutting invariants: `gallery-coverage.test.ts` (every route has a
  quality case or a documented opt-out) and `fixtures-contract.test.ts` (every
  browser fixture is bound to the generated SDK type).
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
in light and dark at once. The cases cover the review surfaces, the admin pages
and the three stand-alone screens (login, forbidden, change password); the
fixtures for the admin pages live in `tests/quality/mocks/pages.mocks.ts`.

`src/__tests__/gallery-coverage.test.ts` requires every route in
`src/router/index.ts` to be either backed by a case or listed in that test as an
opt-out with a reason. Two routes are opted out on purpose — the share page and
the run detail — because the gallery has no fixture for their nested payloads;
the e2e suite drives them instead. Adding a route therefore fails the unit suite
until the author either writes a case or records why not.

## Frontend E2E coverage

Every user-facing feature area has a Playwright spec under
`frontend/tests/e2e/`. A spec creates its own uniquely named project (and
group/user/key where needed) through `fixtures/api.ts`, drives the real UI, and
cleans up in `afterEach`; API calls that need a browser session use
`loginSession()` instead of the project API key.

| Area                                                                               | Spec                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------- |
| Review loop, skip, approve, done page                                              | `image-review-workflow.spec.ts`       |
| PDF compare, downloads, approval, diff reclamation                                 | `pdf-comparison-workflow.spec.ts`     |
| Inbox entry/return                                                                 | `review-inbox.spec.ts`                |
| Inbox bulk approve, project bulk move                                              | `bulk-actions.spec.ts`                |
| Comments: create, filter, resolve, reload, inherited read-only                     | `comments.spec.ts`                    |
| Test metadata: rename, description, tags, size policy, mute/unmute, delete variant | `test-lifecycle.spec.ts`              |
| Threshold edit, auto-accept confirmation, invalid input                            | `threshold.spec.ts`                   |
| Baseline history + restore, inherited read-only                                    | `baseline-history.spec.ts`            |
| Branch switch, inherited baseline, retarget, default, delete guards                | `branches.spec.ts`                    |
| Required approvals (4-eyes vote), assignments, inbox "my reviews"                  | `review-settings-assignments.spec.ts` |
| Storage usage, retention settings, cleanup preview                                 | `storage.spec.ts`                     |
| Share links: create, passphrase, anonymous read, revoke                            | `share-links.spec.ts`                 |
| API keys: create, use, delete (rotate/revoke stay API-only)                        | `api-keys.spec.ts`                    |
| Users: create, reset, deactivate/reactivate, forced password change, viewer gating | `users.spec.ts`                       |
| Sessions list/revoke, 2FA enable/login challenge/disable                           | `security.spec.ts`                    |
| Audit filters and CSV export                                                       | `audit.spec.ts`                       |
| Webhooks: create, edit, activate, test, deliveries, replay, delete, SSRF rejection | `webhooks.spec.ts`                    |
| Runs: list/detail, approve all, finish, JUnit/HTML/CSV reports                     | `runs.spec.ts`                        |
| Trends metrics and range switch                                                    | `trends.spec.ts`                      |
| Variant gallery, overview page, PDF overview note                                  | `test-overview.spec.ts`               |
| Global search, theme persistence, locale switch, logout                            | `search-theme-locale.spec.ts`         |
| Project list/search/filter, group CRUD, project move/delete                        | `groups-projects.spec.ts`             |
| Navigation and 404                                                                 | `navigation.spec.ts`                  |

## Backend E2E coverage

`backend/test/e2e/**/*.e2e-spec.ts` covers the HTTP surface the frontend E2E
cannot reach cheaply: API-key scopes and lifecycle, roles, users administration,
audit export, review comments/assignments, four-eyes votes, thresholds, baseline
history/restore, branch management, variants/pending meta, runs and reports,
share links, webhook management/delivery/replay, storage/quota, PDF pipeline and
maintenance sweeps. Each spec resets the `vrt_e2e` database and calls the real
app through supertest.

Two of them assert database guarantees rather than HTTP contracts, because the
HTTP surface cannot produce the input: `job-queue-concurrency.e2e-spec.ts` drives
the queue from the running app (concurrent claims, stall reclaim, ownership
loss, backoff) and `concurrent-review.e2e-spec.ts` races two uploads and two
approvals. Both are listed as the exception in
[ADR-054](adr/ADR-054-coverage-per-layer-and-real-database-races.md), and each
case was verified to fail when its mechanism is removed.

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
  both suites, merges the maps per file and fails when a file with statements is
  executed by neither suite. That merge is a report, not the gate: it needs
  Docker and ~3 minutes.
- The frontend unit run is gated the same way (`frontend/vite.config.ts`):
  `domains`, `composables`, `lib`, `i18n` and `components` each carry their own
  numbers plus a global floor, and `scripts/verify.sh` runs `test:coverage`, not
  the un-gated variant. `src/router/index.ts`, `src/views/**` and `.vue`
  components stay outside the denominator — the router is wiring whose guards
  have their own tests, the views are covered by the CT suite. A number is raised
  after closing a gap and never lowered. See
  [ADR-055](adr/ADR-055-the-frontend-gate-measures-what-it-runs.md).
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
- The quality suite is `en-US`, one 1440x900 viewport, Chromium only. Axe scans
  the page at rest; dialogs, menus and the command palette are covered by
  `tests/ct/keyboard.spec.ts` (focus in, Escape, focus return, first Tab stop).

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
