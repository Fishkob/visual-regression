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
| **Component** (CT, `frontend/tests/ct/`)      | Playwright         | One Vue component in a real browser, rendered through the story gallery                                                | Vite dev server                                   | medium |
| **Visual / A11y** (`frontend/tests/quality/`) | Playwright         | Every gallery story in light and dark: committed screenshot baselines plus an axe WCAG A/AA scan                       | the quality image (`frontend/Dockerfile.quality`) | medium |

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
  live in [`frontend/AGENTS.md`](../frontend/AGENTS.md).
- **Frontend E2E** — Playwright against a running frontend.
- **Component and quality suites** — both read the **story gallery**: a Vite page
  (`frontend/playwright/gallery/`) that resolves `*.story.ts` files through
  `import.meta.glob` and exposes `window.mount`/`window.unmount`. CT specs drive
  it through Playwright's `mount` fixture; the quality suite walks every story in
  both themes.

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
- The pre-commit hook runs the unit tests of the workspace whose files changed
  (`lint-staged`), without coverage — the gate is the push hook.
- The visual and a11y baselines are Linux amd64. Regenerate them with
  `./scripts/quality.sh visual --update`, and do not change the platform without
  regenerating every snapshot — see [`frontend/AGENTS.md`](../frontend/AGENTS.md).

## Commands

`pnpm run unitTest`, `pnpm run unitTest:cov` (the gated variant),
`pnpm run e2eTest`, `pnpm run coverage:all` (both suites, merged),
`cd frontend && pnpm test`, `cd frontend && pnpm test-e2e`, and
`./scripts/quality.sh visual|a11y`. The one-line description of each is in
[AGENTS.md](../AGENTS.md#testing).
