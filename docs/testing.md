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
would bring it back.

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
| API keys: create/use/rotate/revoke/delete                                          | `api-keys.spec.ts`                    |
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

## Gates

- The backend coverage thresholds are enforced by the Vitest run itself
  (`backend/vitest.config.ts`), so CI fails when they are missed — there is no
  separate coverage step and no second set of numbers to keep in sync.
- The pre-commit hook runs the unit tests of the workspace whose files changed
  (`lint-staged`).
- The visual and a11y baselines are Linux amd64. Regenerate them with
  `./scripts/quality.sh visual --update`, and do not change the platform without
  regenerating every snapshot — see [`frontend/AGENTS.md`](../frontend/AGENTS.md).

## Commands

`pnpm run unitTest`, `pnpm run e2eTest`, `cd frontend && pnpm test`,
`cd frontend && pnpm test-e2e`, and `./scripts/quality.sh visual|a11y`. The
one-line description of each is in [AGENTS.md](../AGENTS.md#testing).
