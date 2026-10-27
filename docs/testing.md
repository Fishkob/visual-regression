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
