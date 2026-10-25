# ADR 020: Testing Strategy — Vitest + Playwright

## Status

Accepted — 2026-06-20 (revised 2026-07-25)

## Context

The project needs a testing strategy that covers unit tests (isolated service/function logic) and E2E tests (full user flows). A middle layer of integration tests (module interactions with real infrastructure but no HTTP) was considered and rejected — see "No Integration Tests" below. The choice of test runner, framework, and test-doubling strategy affects developer experience, CI speed, and confidence in changes.

This strategy validates the architecture described across multiple ADRs: the frontend composable/domain layers ([ADR-009 (Frontend Architecture)](./009-frontend-architecture.md)) are tested via Vitest; the SDK data flow ([ADR-005](./005-openapi-sdk.md)) is tested via mocked `@sdk/` imports in unit tests and real SDK calls in E2E tests.

## Decision

We use two test runners in parallel:

- **Vitest** — Unit tests for both backend and frontend.
- **Playwright** — E2E tests (backend + frontend via UI) and component tests (frontend only).

## Test-Category Decision Matrix

| Test type                                    | What it covers                                                                                                                                                                                  | Infra needed                            | Speed              | CI order           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ | ------------------ |
| **Unit** (Vitest, `*.spec.ts`)               | Business logic, domain rules, service orchestration. All infrastructure mocked via `vi.fn()` or `createMock()`.                                                                                 | None                                    | Fast (~10s)        | 1st                |
| **E2E backend** (Vitest, `*.e2e-spec.ts`)    | Full HTTP round-trip: controller → pipes → guards → interceptors → service → repository → real DB/RustFS/pdf-sidecar. Validates wiring, validation, error handling, and real query correctness. | Postgres, RustFS, pdf-sidecar (Docker)  | Medium (~30s/file) | 2nd                |
| **E2E frontend** (Playwright, `tests/e2e/`)  | Real user flows: upload → navigate → review → approve. Full Playwright browser with real frontend + backend.                                                                                    | Postgres, RustFS, pdf-sidecar, Frontend | Slow               | 3rd                |
| **Component (CT)** (Playwright, `tests/ct/`) | Individual Vue components in a real browser via a story-gallery page. DOM interaction, rendering, a11y.                                                                                         | None (Vite dev server)                  | Medium             | Parallel with unit |

There is **no integration test category**. Repository-layer tests against real Postgres without HTTP were evaluated and rejected — see below.

### Vitest for Unit

- **Single runner across stack**: Vitest is used in both `backend/` and `frontend/`. It exposes the standard `describe`/`it`/`expect` testing style and runs natively on Vite's transform pipeline — no framework-specific transforms needed.
- **ESM/CJS compatible**: Vitest handles the backend's CommonJS output and the frontend's ESM modules without separate configuration.
- **Coverage**: `@vitest/coverage-v8` provides Istanbul-compatible coverage reports. Backend targets unit tests; frontend targets composables and domain logic (excluding UI components, which are covered by Playwright CT). The backend coverage thresholds live in `backend/vitest.config.ts` (≥95% statements/lines/functions, ≥85% branches) and are enforced by the Vitest run itself, so the CI job fails when they are not met.
- **In-source testing**: Backend tests use `Test.createTestingModule()` from `@nestjs/testing` — the NestJS DI container is available without HTTP overhead.

### Playwright for E2E + Component Tests

- **Cross-browser E2E**: Playwright runs Chromium (configured in `playwright-e2e.config.ts`) against the full stack (backend + frontend). Tests simulate real user flows: upload a screenshot, navigate the review UI, approve a comparison.
- **Component Tests (CT)**: CT renders individual Vue components in a real browser via a **story-gallery page** (`frontend/playwright/gallery/`) that resolves `*.story.ts` files through `import.meta.glob` and exposes `window.mount`/`window.unmount`. Specs in `tests/ct/` use `@playwright/test`'s built-in `mount` fixture against that page. This replaces the former `@playwright/experimental-ct-vue` runtime, which was dropped in favor of the simpler gallery approach. It catches rendering bugs, accessibility issues, and interaction behavior that Vitest/jsdom cannot surface.
- **Single vendor**: Using Playwright for both E2E and CT avoids maintaining two browser automation tools. The same `page` API, locator strategy, and assertion patterns apply to both.
- **Trace viewer**: Playwright's trace-on-failure captures DOM snapshots, network logs, and console output — essential for debugging CI failures without reproducing the environment.

### Test-Doubling Strategy

- **Backend unit tests**: Mock at the NestJS provider level via `Test.createTestingModule({ providers: [{ provide: Repository, useValue: mock }] })`. No network calls, no database. Infrastructure modules (Storage, JobQueue) also use provider mocks.
- **Backend E2E tests**: Real infrastructure (Postgres, RustFS, pdf-sidecar) via Docker Compose. Tests call the API via supertest `request(app.getHttpServer())`.
- **Frontend unit tests**: Mock SDK calls via TanStack Query's `queryClient` and `vi.mock('@sdk/...')`. Composables are tested without mounting components. DOM interaction is tested via Playwright CT.
- **Frontend E2E tests**: Full real infrastructure (Postgres, RustFS, backend, frontend). Tests interact with the UI via Playwright locators and assert on DOM state.

### No Integration Tests

A dedicated integration test suite (`test/integration/`) was initially created with a single test for `ProjectRepository` against real Postgres. This was removed on 2026-07-25 because:

1. **Duplicate coverage**: The backend E2E tests already exercise every repository method through real HTTP flows (upload, compare, approve, query, delete). They validate the same Postgres queries with the same data.
2. **No gap to fill**: Unit tests verify business logic in isolation. E2E tests verify the full stack. Integration tests would test the same paths as E2E but without HTTP — additional maintenance without additional confidence.
3. **Slow to write, fast to rot**: Each integration test needs Docker infra (Postgres), global setup, and Prisma schema sync. The overhead per test is similar to E2E, but the confidence gain is lower (no HTTP-layer validation).

**When integration tests would make sense (thresholds to reconsider):**

- Backend E2E suite exceeds 50 files or CI time exceeds 10 minutes, making fast feedback hard
- A complex query/transaction is added that is difficult to trigger via HTTP (e.g., advisory locks, race conditions)
- An external API dependency is added where fault injection (timeout, 503, malformed response) matters and is hard to simulate through HTTP

### Alternatives Considered

Playwright was chosen as the single browser-automation vendor for both E2E and component tests; no other runner needed replacing.

## Consequences

- New backend services should have unit tests in `backend/test/unit/` using `Test.createTestingModule()`.
- New backend controllers should have unit tests (mocked services) existing spec patterns.
- Backend E2E tests (`test/e2e/`) must be added for new HTTP endpoints — these validate the full stack (controller → real DB/RustFS).
- New frontend composables should have Vitest tests in `src/__tests__/`. New UI components should have Playwright CT tests in `tests/ct/` (backed by a `*.story.ts` file picked up by the gallery).
- E2E tests run against Docker Compose services (Postgres + RustFS) and require the frontend to be built or served. The `test:e2e` script coordinates this.
- CI runs: lint/typecheck → unit tests → backend E2E, and frontend lint → build → unit + CT + E2E. The backend unit-test CI job enforces coverage through the thresholds configured in `backend/vitest.config.ts` (≥95% statements/lines/functions, ≥85% branches); the Vitest run fails when they are not met, so there is no separate coverage gate outside Vitest. This should be revisited if it becomes a burden rather than a guard.
- No integration tests should be added unless one of the thresholds above is met.
