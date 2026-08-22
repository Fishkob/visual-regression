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
    visual-test/       # model, mapper, query-keys, status/
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
