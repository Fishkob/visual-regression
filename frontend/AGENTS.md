# AGENTS.md — Frontend (Vue 3 + Vite + Tailwind v4)

## Principles

- `<script setup lang="ts">` Composition API only — no Options API anywhere
- **No Pinia/Vuex** — server state via TanStack Vue Query (`useQuery`/`useMutation`)
- Shared logic in **composables** (camelCase `use*` prefix)
- Domain-driven structure under `src/domains/`

## Directory Structure

```
src/
  components/          # Reusable components
    ui/                # shadcn-style primitives (Badge/, Button/, etc.) with cva()
    cards/, detail-panels/, pdf/, tables/
  composables/         # useProjects, useReviewSession, useTheme, etc.
  domains/             # Domain-driven modules
    projects/          # model, mapper, query-keys, __tests__/
    visual-test/       # model, mapper, query-keys
    test-status/       # shared status types, values, display, filters
    pending-tests/     # model, query-keys
    pdf-test/          # model, query-keys
  lib/                 # sdk.ts, cn(), invalidation, format, observability
  views/               # Page-level components (*View.vue)
  router/              # vue-router config
```

## State Management

- All server state via `@tanstack/vue-query` with centralized query keys in `src/domains/*/query-keys.ts`
- Cache invalidation via `src/lib/invalidation.ts`
- UI state via module-level `ref()` in composables (e.g., `useTheme.ts`, `useReviewSession.ts`)
- Mutations use `useMutation()` directly or `useSdkMutation()` wrapper (adds toast + invalidation)

## File Naming

| Type          | Pattern                        | Example                      |
| ------------- | ------------------------------ | ---------------------------- |
| Components    | PascalCase `.vue`              | `InteractiveImageViewer.vue` |
| UI primitives | PascalCase folder + `index.ts` | `ui/badge/Badge.vue`         |
| Composables   | `use` prefix, camelCase `.ts`  | `useProjects.ts`             |
| Views         | PascalCase `*View.vue`         | `ProjectDetailView.vue`      |
| Domain model  | `*.model.ts`                   | `project.model.ts`           |
| Domain mapper | `*.mapper.ts`                  | `project.mapper.ts`          |
| Query keys    | `query-keys.ts`                | uses `as const` tuples       |
| Tests         | `*.test.ts` (co-located)       | `DataTable.test.ts`          |

## SDK Integration

- Import from `@sdk` (path alias → `../client-sdk`)
- Wrap SDK responses with `getData()` from `src/lib/sdk.ts` to unwrap payload
- Vite proxies `/api/*` → `localhost:3000`

## Styling

- Tailwind v4 with `@import "tailwindcss"` syntax
- `cn()` utility (`clsx` + `twMerge`) for conditional classes
- CSS variables + `@theme` block in `style.css` for shadcn-style theming
- Dark mode via `.dark` class toggled by `useTheme`
- UI primitives use `cva()` from `class-variance-authority`

## Testing

- Vitest + jsdom + `@vue/test-utils`
- Tests in `src/__tests__/` (component/composable) or `src/domains/*/__tests__/` (mapper)
- Mock SDK via `vi.mock("@sdk", ...)`, router via `vi.mock("vue-router", ...)`
- Use `data-testid` attributes for element queries
- Theme quality suites run in Docker so local x86_64 and CI use one Linux amd64
  baseline set: `./scripts/quality.sh visual`, `./scripts/quality.sh a11y`.
  Update baselines with `./scripts/quality.sh visual --update`. CI runs on
  `ubuntu-latest` with `QUALITY_PLATFORM=linux/amd64`, so x86_64 is the
  canonical platform; on Apple Silicon the amd64 image runs under emulation.
  Do not switch the platform without regenerating every snapshot.
- `test-visual` / `test-a11y` are the in-container commands used by
  `scripts/quality.sh`. Run them through the script, not directly on the host.
- The quality suites cover every `QUALITY_CASES` entry in light and dark mode.
  A new page needs a case there (story + mocks + `readyTestId`) or an explicit
  opt-out line in `src/__tests__/gallery-coverage.test.ts` with the reason —
  that test fails the unit suite for a route that has neither.
- The quality image is pinned to Linux amd64 and `quality.sh` refuses a
  `--no-build` run against an image of another architecture. Regenerating the
  baselines on the pinned image must be a no-op; if it is not, the platform or
  the image changed and every snapshot needs review, not a blind `--update`.
- Keyboard operation and focus are part of the CT suite
  (`tests/ct/keyboard.spec.ts`): a dialog or overlay you add needs a case there
  (focus moves in, Escape closes, focus returns). Axe only sees the page at rest.

### Coverage gate

- `pnpm test:coverage` is the gated variant (`pnpm test` is not): thresholds per
  layer in `vite.config.ts` (`domains`, `composables`, `lib`, `i18n`,
  `components`) plus a global floor. Raise a number after closing a gap; never
  lower one to make a red run green. `scripts/verify.sh` runs this variant.
- `src/router/index.ts`, `src/views/**` and `src/components/**/*.vue` stay out of
  the denominator: the router is wiring, the views and components are CT-covered.
  Non-`.vue` modules under `src/components/` stay in scope.

### Browser fixtures

- `FulfillResponse.body` is a string, so a fixture does not type-check against
  the API by itself. Every shared fixture used by the gallery is bound to the
  generated SDK type in `src/__tests__/fixtures-contract.test.ts`; when a DTO
  changes, that test fails `typecheck` instead of rendering `undefined` into a
  green screenshot. Add a binding for every new shared fixture.
- Prefer the existing helpers (`mockApi`, `mockEmptyThreads`,
  `mockBaselineHistory`, `mockReviewBackend`) over a new `page.route` call — an
  unmocked request escapes to the Vite proxy and paints an error state into the
  shot.

### Component coverage

- Component tests are **page-level**, not per component: a spec mounts a gallery
  story (`views/<View>View/<Export>` or `AppShell/AppShell`), mocks the API
  (`tests/ct/routes/api.routes.ts`) and drives the real view.
- `src/components/ui/**` (shadcn/reka-ui wrappers with `cva()` variants) gets
  **no own spec** — their rendering is the library's contract, and they are
  covered indirectly by the page flows and the light/dark quality suites. The
  exception is our own logic inside `ui/`: `DataTable.vue` keeps its Vitest test.
- Every other component is covered either by a page-level CT spec (the normal
  case) or, when it carries logic worth isolating, by a dedicated
  `src/__tests__/<Component>.test.ts`.
- A new component therefore needs one of the two, plus a `data-testid` on
  whatever the test must find; a component that only the quality suite reaches
  is not covered, it is merely rendered.
- Because views and `.vue` components are CT-covered, the Vitest coverage gate
  (`vite.config.ts` → `test.coverage`) measures the **logic layer only**:
  `src/views/**` and `src/components/**/*.vue` are excluded from its denominator.
  Non-`.vue` modules under `src/components/` stay in scope. Adding a view does
  therefore not move the coverage number — its coverage comes from the CT spec.

### Language-independent selectors

- Find elements via `getByTestId(TEST_ID.*)` only — constants live in `src/lib/test-ids.ts` and are imported by markup and tests alike.
- Assert visible content with `toContainText`/`toHaveText` (these intentionally track the UI language).
- `getByRole` without a `name` is allowed for semantics/a11y (e.g. `getByRole("heading", { level: 1 })`).
- Data values (viewports, project/test names, badge counts) are a documented exception: `getByRole("option", { name })` and `filter({ hasText: dataValue })` are fine.
- Enforced by the `no-text-selectors` ESLint rule for `tests/ct/**/*.ts` and `tests/e2e/**/*.ts`.
