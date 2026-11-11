# AGENTS.md — Visual Regression Platform

## Prerequisites

- Docker & Docker Compose
- pnpm (package manager)

## Quick Start

```
./scripts/dev.sh local    # Install deps + prepare env (then `pnpm run dev` for hot reload)
./scripts/dev.sh infra     # Start infra only (postgres, rustfs, pdf-sidecar)
./scripts/dev.sh docker    # All services in Docker (production-like)
./scripts/dev.sh seed      # Seed database with demo + e2e + dev data
./scripts/dev.sh stop      # Stop Docker services
./scripts/dev.sh delete    # Stop and remove all data + builds
./scripts/dev.sh reset     # Full reset: delete → infra → local
```

**First-time setup:** `./scripts/dev.sh reset`
Walkthrough: `docs/local-development.md`

## Dev Commands

| Command                 | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `pnpm run dev`          | Backend + frontend hot reload (requires infra) |
| `pnpm run dev:backend`  | Backend only                                   |
| `pnpm run dev:frontend` | Frontend only                                  |
| `pnpm run bootstrap`    | Install deps + generate SDK + build            |

## Testing

| Command                                | Purpose                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `pnpm run unitTest`                    | Backend unit tests (vitest)                                       |
| `pnpm run unitTest:cov`                | Backend unit tests + the per-layer coverage gate                  |
| `pnpm run coverage:all`                | Both backend suites, coverage merged per file                     |
| `pnpm run e2eTest`                     | Backend E2E tests (auto-starts Docker)                            |
| `cd frontend && pnpm test`             | Frontend unit tests (vitest + jsdom)                              |
| `cd frontend && pnpm test:coverage`    | Frontend unit tests + the per-layer coverage gate                 |
| `cd frontend && pnpm test-ct`          | Playwright component tests incl. keyboard/focus (Vite dev server) |
| `cd frontend && pnpm test-e2e`         | Frontend E2E (requires frontend running)                          |
| `./scripts/quality.sh visual`          | Dark/light screenshot suite (Docker, Linux amd64 baselines)       |
| `./scripts/quality.sh a11y`            | Axe WCAG A/AA scan in both themes                                 |
| `./scripts/quality.sh visual --update` | Regenerate visual baselines                                       |

`./scripts/verify.sh --with-browser` adds the CT suite to the local gate,
`--with-quality` adds the visual and a11y runs; the default gate stays browser-free.

Suite layout, the infrastructure each suite needs and the coverage gates: [docs/testing.md](docs/testing.md).

## Code Quality

```
pnpm run lint              # Backend lint + fix
pnpm run typecheck:all     # Backend + backend:test + frontend type check
pnpm run format            # Format all code
pnpm run format:check      # Check formatting only
```

**Order:** `lint` → `typecheck:all` → `format` → `unitTest`

**Local gate:** `./scripts/verify.sh` runs lint + typecheck + format + backend
unit with the per-layer coverage gate + frontend unit with its per-layer coverage
gate + the i18n parity check + the SDK drift check in one command (~2 min). It is
wired into `.husky/pre-push`, so a normal `git push` runs it; `--fast` skips the
frontend suite and the SDK check, `--with-e2e` adds the backend e2e suite,
`--with-browser` the Playwright CT suite and `--with-quality` the visual + a11y
runs in the quality image. CI runs the same checks on every push and pull
request; `verify.sh` is what must be green before you push.

## SDK Generation

```
pnpm run sdk:generate      # Regenerate SDK (no Postgres needed — swagger-export mocks DB providers)
pnpm run sdk:build         # Build the SDK (tsc)
```

Pipeline: Prisma schema → Swagger → OpenAPI → `@hey-api/openapi-ts` → `client-sdk/`

**Auto-regeneration on commit:** The pre-commit hook runs `scripts/sdk-generate-if-needed.sh`, which regenerates the SDK whenever a staged file under `backend/src/`, `backend/prisma/schema.prisma`, or `openapi-ts.config.ts` changed. The regenerated `backend/swagger.json` + `client-sdk/` files are re-staged automatically. Run `pnpm run sdk:generate && pnpm run sdk:build` manually when needed (e.g. to check frontend drift before committing).

## Database

```
pnpm run db:prepare         # Generate Prisma client + apply migrations
cd backend && pnpm db:ui    # Prisma Studio
```

Schema management uses `prisma migrate` (dev: `migrate dev`, CI/prod: `migrate deploy`). See ADR-024.

## Per-Workspace AGENTS.md

Per-workspace conventions in `backend/AGENTS.md`, `frontend/AGENTS.md`, `client-sdk/AGENTS.md`

## Architecture

```
backend/        — NestJS + Prisma + PostgreSQL
frontend/       — Vue 3 + Vite + Tailwind v4 + TanStack Query
client-sdk/     — TypeScript SDK (auto-generated via @hey-api/openapi-ts)
```

**Ports:** Backend `:3000`, Frontend `:5173` (local) / `:80` (Docker), RustFS `:9000` (console `:9001`), PostgreSQL `:5432`

## Agent Guidelines

Before starting any work:

1. **Check domain language** — read `CONTEXT.md` for terminology (avoid inventing new terms)
2. **Load sub-AGENTS.md** — before touching `backend/`, `frontend/`, or `client-sdk/`, read the corresponding `*/AGENTS.md` for workspace-specific conventions
3. **Never edit `.gen.ts` files** — these are auto-generated by the SDK pipeline; edit the source (Prisma schema, DTOs, controllers) instead
4. **Don't add new dependencies** without checking `package.json` first — existing libraries are preferred
5. **Follow existing patterns** — match the style and structure of neighboring files; don't rewrite
6. **Don't add comments** unless the code is genuinely unclear — this codebase prefers self-documenting code
7. **Verify before claiming completion** — run `lint` → `typecheck:all` → `format` → `unitTest` (or the relevant subset for the workspace)
8. **Don't assume test frameworks** — check AGENTS.md for the exact test command
9. **Don't rewrite accepted ADRs** — `docs/adr/` records decisions, not the code as it is today; a changed decision gets a new ADR that supersedes the old one (rules in `CONTRIBUTING.md`)
10. **Touch one doc** — a rule lives in exactly one document: `CONTEXT.md` for today's rule, an ADR for the history, the roadmap for status, `README.md`/`docs/` for usage. Link, don't copy (table in `CONTRIBUTING.md#where-a-rule-lives`)

## Conventions

### Project-wide

- **Monorepo** managed by pnpm workspaces (backend, frontend, client-sdk)
- **TypeScript v6**, strict mode
- **Prettier** for formatting, **ESLint** for linting (per workspace)
- **Husky** + **lint-staged** on pre-commit: lint → typecheck → tests per workspace
- No Biome, no Makefile — all task running via pnpm scripts + bash scripts
- File naming: `kebab-case.ts` (backend), PascalCase for Vue components, camelCase for composables

### Backend (NestJS)

Full conventions in `backend/AGENTS.md`. The facts an agent needs before reaching it:

- Feature modules under `src/modules/public/visualTest/` (core/ intake/ review/ catalog/ runs/ access/ notifications/), internal under `src/modules/internal/`
- Strategy pattern via multi-provider DI collections (`COMPARISON_ENGINES`, `MAINTENANCE_TASKS`); tokens as `export const TOKEN = 'TOKEN'` in `common/domain/`
- Path aliases: `@common/*`, `@public/*`, `@internal/*`, `@config/*`, `@prisma/*`, `@/*`, `@test/*`

### Frontend (Vue 3)

Full conventions in `frontend/AGENTS.md`. The facts an agent needs before reaching it:

- `<script setup lang="ts">` Composition API only — no Pinia/Vuex, all server state via TanStack Vue Query
- **Domain-driven** structure under `src/domains/` — each domain has model, mapper, query-keys
- SDK calls extract data via `getData()` helper (`src/lib/sdk.ts`)
- Tailwind v4 with `cn()` utility (`clsx` + `twMerge`); shadcn-style UI folders with `cva()` variants

### Client SDK

Full conventions in `client-sdk/AGENTS.md`. The facts an agent needs before reaching it:

- Fully auto-generated by `@hey-api/openapi-ts` — never edit `.gen.ts` files (see guideline #3)
- Zero runtime dependencies; local dev resolves raw `.ts` source via `@sdk` alias; build via `tsc` to `dist/`

## Current State

**lint ✓ | typecheck:all ✓ | format ✓ | backend unit 1930/1930 + coverage gate ✓ | frontend unit 1193/1193 + coverage gate ✓ | frontend visual 50/50 + a11y 50/50 ✓ (quality image) | backend e2e 286/286 · frontend CT 103/103 (last full run)** — the rename work added one backend e2e case and three CT cases, verified by running those specs; the frontend e2e suite was not re-run (it needs the seeder's `E2E_API_KEY`, which CI provides). Re-run the suites for current counts.

The upload → compare → review → approve pipeline is complete for both image and PDF kinds, including threshold auto-accept, per-variant status derivation, API-key CI authentication, the self-hosting installer (`./install.sh`), worker retry/deadline hardening, config-as-code thresholds (`.vrt.json`), a project default threshold, share links that show the diff, and worker/queue observability. Phases 1–6 of the roadmap (R1–R26) are shipped; the history lives in git and the CHANGELOG, and `docs/roadmap.md` now lists only the open candidates.
