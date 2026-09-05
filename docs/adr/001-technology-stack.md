# ADR 001: Technology Stack — Monorepo, Backend, and Frontend

## Status

Accepted — 2026-04-12 (monorepo), 2026-06-20 (NestJS, frontend)

Supersedes: ADR-001 (Monorepo), ADR-018 (NestJS Framework), ADR-019 (Frontend Stack)

## Context

The application consists of several independent parts — Backend (NestJS), Frontend (Vue 3 + Vite), and Client SDK — that must be developed, tested, and deployed together. Three technology decisions were made independently:

1. Monorepo structure (April 2026)
2. Backend framework (June 2026)
3. Frontend stack (June 2026)

This ADR consolidates all three.

---

## 1. Monorepo with pnpm Workspaces

### Decision

We use a monorepo with pnpm Workspaces.

### Rationale

**Advantages:**

- **Shared Dependencies**: TypeScript, ESLint, Prettier can be managed centrally
- **Consistent Development Experience**: Same commands for all packages (`npm run test`, `npm run lint`)
- **Easy Refactoring**: Changes to shared types can be made in a single commit
- **Tight Integration**: SDK and Backend evolve in sync — no versioning issues
- **Better CI/CD**: Single pipeline for the entire repo, no publish pipeline between repos

**Disadvantages:**

- Larger repository
- Potentially longer `npm install` times (due to workspace resolution)
- More configuration overhead

**Alternatives Considered:**

- **Separate Repos**: Would require sync issues between SDK and Backend (changesets, publishing)
- **npm/yarn workspaces**: pnpm offers better disk space efficiency through content-addressable storage

### Consequences

- All packages are orchestrated from the root `package.json`
- Cross-package dependencies are referenced via `workspace:*`
- Global tools (lint, test) are defined in the root and used by packages

---

## 2. NestJS as Backend Framework

### Decision

We use NestJS v11 with the Express platform adapter, TypeScript, and decorator-based dependency injection.

NestJS's `@Module()` decorators and DI container directly realize the module dependency graph and provider injection patterns documented in [ADR-013 (Backend Structure)](./013-backend-structure.md). It also enables the OpenAPI-first SDK pipeline ([ADR-005](./005-openapi-sdk.md)) via `@nestjs/swagger` decorators that drive spec generation.

### Rationale

**Advantages:**

- **Modular architecture**: NestJS modules map directly to our domain modules (intake, review, core, internal). `@Module()` with explicit `imports`/`providers`/`exports` makes the dependency graph self-documenting.
- **Dependency injection**: Constructor-based DI with injection tokens enables testability without a service locator. Providers can be substituted in tests via `Test.createTestingModule()`.
- **Decorator-based controllers**: `@Controller()`, `@Post()`, `@Body()`, `@UseGuards()` keep request handling declarative and consistent across all endpoints.
- **Lifecycle hooks**: `OnApplicationBootstrap`, `OnModuleInit` enable clean startup/teardown for background services (e.g., `ComparisonJobPoller`).
- **Ecosystem**: `@nestjs/swagger` generates the OpenAPI spec from decorators (our SDK pipeline source), `@nestjs/schedule` for cron jobs, `@nestjs/config` for env validation. Rate limiting needs no NestJS module — it is a first-party Postgres counter guard (see [ADR-026](./026-rate-limit-unification.md)).
- **Testing utilities**: `@nestjs/testing` provides `Test.createTestingModule()` with the same DI container — services are testable without HTTP overhead.

**Disadvantages:**

- **Boilerplate**: Modules, providers, and decorators add ceremony vs. a raw Express app.
- **Opinionated**: NestJS's module system and DI container shape the architecture; working outside it (e.g., raw Express middleware) requires workarounds.
- **Performance overhead**: The DI container and proxy wrapping add marginal latency vs. bare Fastify, but at our scale this is irrelevant.

**Alternatives Considered:**

- **Express (raw)**: Maximum flexibility but no structural guidance. Every team member invents their own module layout. No DI, no lifecycle management. Would need to build or adopt all the infrastructure NestJS provides out of the box.
- **Fastify**: Faster than Express, good plugin system, but smaller ecosystem. `@nestjs/platform-fastify` exists but was not chosen because Express's middleware ecosystem (helmet, etc.) was more familiar and sufficient.
- **Hono**: Ultralight, fast, but newer and smaller ecosystem. Lacks the mature testing and Swagger tooling NestJS provides.

### Consequences

- All backend code lives within NestJS's module system: `@Module()`, `@Injectable()`, `@Controller()`.
- `Test.createTestingModule()` is the standard pattern for unit tests.
- The OpenAPI spec is generated from decorators (`@ApiTags()`, `@ApiOperation()`) — no hand-maintained spec file.
- The Express platform adapter is coupled to `@nestjs/platform-express`. Switching to Fastify would require changing the adapter and testing all middleware.
- The framework choice is visible in the build pipeline: `nest-cli.json`, `@nestjs/cli`, SWC builder for fast compilation.

---

## 3. Vue 3 + Vite + Tailwind Frontend Stack

### Decision

We use Vue 3 with Composition API (`<script setup>`) and TypeScript, Vite as the build tool, Vue Router for client-side routing, and Tailwind CSS v4 with shadcn-vue (New York style) and Reka UI headless primitives for the UI layer.

This stack implements the three-layer frontend architecture ([ADR-009 (Frontend Architecture)](./009-frontend-architecture.md)) — the composable pattern via TanStack Vue Query and the `@sdk/` imports that drive data fetching from the OpenAPI-generated client ([ADR-005](./005-openapi-sdk.md)).

### Rationale

**Advantages:**

- **Vue 3 + Composition API**: Type-safe component logic via `<script setup lang="ts">`. Composables (`use*` functions) enable logic reuse without mixins or higher-order components. Reactive system (`ref()`, `computed()`, `watch()`) is simple and predictable.
- **Vite**: Sub-second HMR, native ESM dev server, fast production builds via Rollup. No bundler configuration overhead.
- **Tailwind CSS v4**: Utility-first CSS with the `@tailwindcss/vite` plugin. Zero runtime, small production bundles via purging. The utility approach matches our component-based architecture — styles colocated with markup, no context-switching to CSS files.
- **shadcn-vue + Reka UI**: Copy-paste component library built on Reka UI (headless, accessible primitives). Components are owned in-tree (in `src/components/ui/`) — fully customizable, no version-locked dependency. Reka UI handles accessibility (keyboard navigation, focus management, ARIA attributes).
- **TanStack Vue Query**: Server state management with caching, deduplication, background refetching. No manual fetch/loading/error state management in components.

**Disadvantages:**

- **Vue 3 ecosystem smaller than React**: Fewer third-party libraries and community resources, though this gap is narrowing.
- **Tailwind verbosity**: Markup can be dense with utility classes. We mitigate this with component abstractions (shadcn-vue components, small localized composables).
- **shadcn-vue updates manual**: Because components are copied into the repo, upstream fixes must be merged manually. In practice this is rare — the components are stable and we customize them.

**Alternatives Considered:**

- **React + Next.js**: Larger ecosystem, but Next.js's server-side rendering model adds complexity (server/client boundaries, data fetching strategy) that we don't need for our primarily client-rendered review dashboard. React lacks Vue's built-in reactive system (`ref()`/`computed()`), relying on `useState`/`useMemo` with manual dependency arrays.
- **Svelte + SvelteKit**: Compiler-based approach produces less boilerplate, but the ecosystem is smaller and team familiarity with Vue was higher.
- **Nuxt**: Full-featured Vue meta-framework with file-based routing, SSR, auto-imports. We chose raw Vue + Vite + Vue Router because the app is a client-rendered SPA — Nuxt's SSR and auto-import features add complexity without benefit.
- **Webpack**: Historically the standard, but Vite's HMR speed and simpler configuration are decisive advantages for developer experience.
- **CSS Modules / Styled Components**: Scoped styling without utility classes, but lead to larger CSS bundles and context-switching between template and style files.

### Consequences

- Components use `<script setup lang="ts">` and the Composition API. No Options API.
- All UI primitives live in `src/components/ui/` and are customized in-tree.
- Styling is done with Tailwind utility classes in the template. Custom CSS is rare and scoped to component boundaries.
- The frontend is a pure SPA — no SSR, no hydration. All data comes from the SDK via TanStack Vue Query.
- Vite config manages path aliases (`@/` → `src/`, `@sdk/` → client-sdk). Adding new path aliases requires updating both `vite.config.ts` and `tsconfig.json`.
