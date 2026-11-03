# ADR 020: Testing Strategy — Vitest + Playwright

## Status

Accepted — 2026-06-20 (revised 2026-07-25). Partially superseded by
[ADR-054](./ADR-054-coverage-per-layer-and-real-database-races.md): the single
global coverage threshold and the rule that a test may never drive a service
without HTTP.

## Context

The project needs a testing strategy that covers unit tests (isolated service/function logic) and E2E tests (full user flows). A middle layer of integration tests (module interactions with real infrastructure but no HTTP) was considered and rejected — see "No Integration Tests" below. The choice of test runner, framework, and test-doubling strategy affects developer experience, CI speed, and confidence in changes.

This strategy validates the architecture described across multiple ADRs: the frontend composable/domain layers ([ADR-009 (Frontend Architecture)](./009-frontend-architecture.md)) are tested via Vitest; the SDK data flow ([ADR-005](./005-openapi-sdk.md)) is tested via mocked `@sdk/` imports in unit tests and real SDK calls in E2E tests.

## Decision

We use two test runners in parallel:

- **Vitest** — unit tests for both backend and frontend, and the backend E2E suite (`*.e2e-spec.ts`), which is a supertest round-trip against a real app instance.
- **Playwright** — E2E tests (the frontend UI driving the real stack) and
  component tests (frontend only).

## Rationale

- **One unit runner across the stack**: Vitest runs in `backend/` and `frontend/`, natively on Vite's transform pipeline — no framework-specific transforms, and no separate configuration for the backend's CommonJS output and the frontend's ESM modules.
- **One browser vendor**: Playwright serves both E2E and component tests, so the same `page` API, locator strategy and assertion patterns apply to both instead of maintaining two browser tools.
- **Real browser for components**: a component test renders in Chromium through the story gallery, which catches rendering and accessibility bugs that jsdom cannot surface.
- **Trace-on-failure**: Playwright captures DOM snapshots, network logs and console output, which is what makes a CI-only failure debuggable.
- **The backend E2E suite needs no second runner**: it asserts over HTTP through supertest, not through a browser.

## No Integration Tests

A dedicated integration test suite (`test/integration/`) was initially created with a single test for `ProjectRepository` against real Postgres. This was removed on 2026-07-25 because:

1. **Duplicate coverage**: The backend E2E tests already exercise every repository method through real HTTP flows (upload, compare, approve, query, delete). They validate the same Postgres queries with the same data.
2. **No gap to fill**: Unit tests verify business logic in isolation. E2E tests verify the full stack. Integration tests would test the same paths as E2E but without HTTP — additional maintenance without additional confidence.
3. **Slow to write, fast to rot**: Each integration test needs Docker infra (Postgres), global setup, and Prisma schema sync. The overhead per test is similar to E2E, but the confidence gain is lower (no HTTP-layer validation).

**When integration tests would make sense (thresholds to reconsider):**

- Backend E2E suite grows well past its current size (or CI time exceeds 10 minutes), making fast feedback hard
- A complex query/transaction is added that is difficult to trigger via HTTP (e.g., advisory locks, race conditions)
- An external API dependency is added where fault injection (timeout, 503, malformed response) matters and is hard to simulate through HTTP

## Alternatives Considered

- **Jest only**: works for both backend and frontend, but needs additional configuration for ESM, TypeScript path aliases and Vue SFC transforms; Vitest handles these natively through Vite.
- **Vitest for everything, E2E included**: `@vitest/browser` still requires Playwright or WebDriver as a transport layer, so using Playwright directly was simpler and more capable for multi-page flows.
- **Cypress**: full-featured E2E with time-travel debugging, but slower CI execution, no native component testing at the time of evaluation, and a different API than the unit runner.
- **Testing Library (`@testing-library/vue`) + Vitest for the frontend**: the standard in React projects, but it has less traction in the Vue ecosystem; Playwright CT with real browser rendering gives more confidence than jsdom assertions.

## Consequences

- New backend services get unit tests in `backend/test/unit/`; new controllers get unit tests against a mocked service; new HTTP endpoints get an E2E test in `backend/test/e2e/`.
- New frontend composables get a Vitest test in `src/__tests__/`. A new UI component gets a page-level CT spec in `tests/ct/` backed by a `*.story.ts` file — or a Vitest mount test when its own logic is worth isolating.
- No integration tests are added unless one of the thresholds above is met.
- The suite layout, the per-category infrastructure, the story-gallery mechanism and the coverage gates live in [docs/testing.md](../testing.md). This ADR records the choice, not the current test inventory.
