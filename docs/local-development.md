# Local Development Guide

> **Self-hosting?** This guide is the developer setup (pnpm, hot reload,
> `./scripts/dev.sh reset` wipes data). To run the Docker stack, use `./install.sh`
> — see the [README quick start](../README.md#quick-start) and
> [self-hosting.md](self-hosting.md).

## Prerequisites

- Docker & Docker Compose
- **Node.js ≥ 24.15** (required by the NestJS v12 CLI; enforced via `engines`, see `.node-version`)
- pnpm ≥ 10 (auto-installed by `dev.sh` if missing)

## First-time Setup

```bash
# 1. Install pnpm if you don't have it
npm install -g pnpm

# 2. Full reset: clean everything → start infra → install deps
./scripts/dev.sh reset
```

This runs `delete` (clean slate) → `infra` (postgres + rustfs in Docker) → `local` (pnpm install, prisma generate, migrate dev, SDK generation).

## Daily Workflow

`pnpm run dev` is all you need — it starts the infra (if not already running) and then hot-reloads backend + frontend:

```bash
pnpm run dev
```

### Run only backend or frontend:

```bash
pnpm run dev:backend    # Backend on :3000
pnpm run dev:frontend   # Frontend on :5173
```

## Common Tasks

| Task                           | Command                                           |
| ------------------------------ | ------------------------------------------------- |
| Start dev servers (with infra) | `pnpm run dev`                                    |
| Run full stack in Docker       | `pnpm start`                                      |
| Start infra only               | `./scripts/dev.sh infra`                          |
| Stop all Docker services       | `./scripts/dev.sh stop`                           |
| Full clean restart             | `./scripts/dev.sh reset`                          |
| Nuke everything                | `./scripts/dev.sh delete`                         |
| Seed test data                 | `./scripts/dev.sh seed`                           |
| Install deps + SDK + build     | `pnpm run bootstrap`                              |
| Build all packages             | `pnpm run build`                                  |
| Open database UI               | `pnpm run db:prepare && cd backend && pnpm db:ui` |
| Generate SDK                   | `pnpm run sdk:generate && pnpm run sdk:build`     |

## Seeding demo data

`./scripts/dev.sh seed` runs four seeders: a demo set (projects, tests, variants,
groups, CI runs and feature branches), the e2e fixtures, a dev project, and the
multi-team demo. The first three talk to the authenticated REST API; the fourth
writes users, teams and project ownership straight into the database
([why](#multi-team-demo-data)). `./install.sh --seed` runs the same four from the
host against the Docker stack, so they need the published ports (`:3000`, `:5432`).

The three REST seeders authenticate with an API key, so they need `SEED_API_KEY`:

- `./scripts/dev.sh seed` sources `backend/.env.local` — set `SEED_API_KEY` there,
  or set `ADMIN_API_KEY` and `dev.sh` provisions a `dev-seed` key with every scope
  through the admin endpoint and persists it to `backend/.env.local`, so later runs
  reuse it instead of minting another one.
- Running `pnpm run seed:*` directly requires `export SEED_API_KEY=<rawKey>`
  first, because the scripts do not load dotenv files themselves.

The demo seed deletes existing projects before it writes, so a repeated run
replaces the dataset instead of piling up. Every image test is seeded in one of the
four review states — pending, unchanged, muted or approved — so the inbox, the
project table and the run gate show what the product distinguishes instead of a
dozen identical pendings; the map is `DEMO_STORY`. The seed also creates **feature
branches** to exercise branch-scoped baselines: each branch carries one pending
review whose first upload inherited the target branch's baseline, tests that were
never uploaded on the branch read as `inherited`, and one branch is archived
(`admin-ui/experiment/old-header`). The scenarios live in
[`backend/src/scripts/seeds/fixtures.ts`](../backend/src/scripts/seeds/fixtures.ts)
(`DEMO_STORY`, `DEMO_BRANCH_SEEDS`, `DEV_BRANCH_SEEDS`). The local `.env.local`
ships with `UPLOAD_RATE_LIMIT_PER_MINUTE=0`, because a full seed uploads hundreds of
screenshots; the seeders also retry on `429`, so seeding works either way, just
slower with the limit enabled.

Approving a seeded test waits for the worker to produce the comparison (the demo
seed polls the variant read) — a seed run therefore needs the worker up, just like
the review UI does.

### Multi-team demo data

`seed:teams` gives the demo dataset the three states the project scope
distinguishes ([ADR-082](adr/ADR-082-team-scoped-project-access.md)): a project of
your own team, a project of another team, and a **shared** one.

| Team       | Owns           | Member             |
| ---------- | -------------- | ------------------ |
| Storefront | `checkout-ui`  | `storefront-lead`  |
| Backoffice | `dashboard-ui` | `backoffice-lead`  |
| — shared   | `admin-ui`     | everyone signed in |

`demo-viewer` (VIEWER) belongs to no team and therefore sees only the shared
project. The three demo logins use the published password from `DEMO_USER_PASSWORD`
(`demo-password`; `SEED_DEMO_USER_PASSWORD` overrides it) and are ordinary
accounts — no forced password change, so a demo can log in again after a re-seed.
`admin-ui` keeps its `Internal tools` group membership on purpose: a group is
navigation, so a folder may hold a shared project next to a team-owned one. The
demo groups are named `Customer-facing` and `Internal tools` — deliberately not
like the teams, because a group is a folder and the two must not read as one
concept. The fixtures
are `DEMO_USERS`, `DEMO_TEAMS` and `DEMO_SHARED_PROJECTS` in
[`fixtures.ts`](../backend/src/scripts/seeds/fixtures.ts); `buildTeamPlan` refuses
a set that leaves a demo project neither owned nor shared.

Unlike the other three, this seeder does not use the REST API: user and team
administration is session-only and `ADMIN`-only by design, and a seeder must not
log in as a human admin whose password is one-time (the bootstrap admin) or
already rotated. It therefore talks to the database itself:

- `DATABASE_URL` (what the backend reads) wins, then the `POSTGRES_*` variables
  (what `prisma.config.ts` reads), then `SEED_DATABASE_URL` as the explicit
  override.
- `./scripts/dev.sh seed` passes the `POSTGRES_*` set, so the normal path needs
  no setup; `pnpm run seed:teams` alone needs them exported like `SEED_API_KEY`,
  and it needs **no** API key.
- It is idempotent and self-healing: users are upserted by name, each member set
  is replaced, and every demo project's team is re-stated, so a re-run repairs a
  hand-edited demo instead of piling up. It also deletes the demo users' sessions,
  so a re-seed logs them out.
- Order matters: the demo seed deletes all projects before it writes, so
  `seed:teams` runs last (`seed:all` does) and fails loudly when the demo projects
  are missing.
- The rows it writes carry no audit entry — they go through Prisma, not the
  audited admin API.

## Testing

### Unit tests

No infrastructure required:

```bash
pnpm run unitTest                  # Backend unit tests
pnpm run unitTest:cov              # Backend unit tests with coverage
cd frontend && pnpm test           # Frontend unit tests
```

### Backend E2E

Starts the required infrastructure (Postgres, RustFS, pdf-sidecar)
automatically if it is not already running:

```bash
pnpm run e2eTest
```

### Frontend E2E

Needs the full Docker stack (frontend, backend, worker, pdf-sidecar) — the
same stack CI uses:

```bash
# 1. Start the full stack (as CI does)
./scripts/dev.sh docker

# 2. Wait until the frontend answers
curl -sf http://localhost:80 >/dev/null && echo ready
#    docker compose ps should show: postgres, rustfs, pdf-sidecar,
#    backend, worker, frontend (one-shot db-migrate/rustfs-init exit)

# 3. Install the Playwright browser (first time only)
cd frontend && pnpm exec playwright install chromium

# 4. Run the suite (default: against localhost:80)
cd frontend && pnpm test-e2e

# Only the image-review suite:
cd frontend && pnpm exec playwright test -c playwright-e2e.config.ts image-review-workflow --workers=1

# FRONTEND_URL overrides the target if the stack runs elsewhere:
FRONTEND_URL=http://localhost:80 pnpm test-e2e
```

Worker and pdf-sidecar are mandatory — image comparisons run in the worker,
PDF comparisons are orchestrated there and delegate the heavy lifting to the
pdf-sidecar. Without them, comparison jobs time out.

The tests are isolated: each test uses a unique project name
(`e2e-image-<timestamp>-<random>`) and deletes its project in `afterEach`,
and `--workers=1` (enforced in CI, recommended locally) keeps the shared
worker free of competing upload+compare load.

## Code Quality

```bash
pnpm run lint            # Backend lint + fix
pnpm run typecheck:all   # Backend + backend:test + frontend
pnpm run format          # Format all
pnpm run format:check    # Check formatting only
```

Recommended order: `lint` → `typecheck:all` → `format` → `unitTest`

## Architecture

```
./
├── docker-compose.yml         # Full stack (postgres, rustfs, backend, worker, frontend)
├── docker-compose.infra.yml   # Infra only (postgres, rustfs)
├── scripts/dev.sh             # Main dev orchestration
├── backend/                   # NestJS + Prisma
├── frontend/                  # Vue 3 + Vite + Tailwind
└── client-sdk/                # Generated TypeScript SDK
```

## Where to read next

The setup above gets a stack running; these four reads explain why it is shaped
the way it is, in the order a new contributor needs them:

1. **[CONTEXT.md](../CONTEXT.md)** — the domain vocabulary. Read the terms
   before the code: a `Variant`, a `Run` and a `Comparison` are not the words a
   reader assumes.
2. **[docs/testing.md](testing.md)** — which suite owns which layer, and why a
   unit spec may assert query policy but never a lock (ADR-054, ADR-059).
3. **[ADR-036 — test lifecycle](adr/ADR-036-test-lifecycle.md)** and
   **[ADR-024 — migrations](adr/024-database-migrations.md)** — the two
   decisions most changes touch.
4. **[docs/roadmap.md](roadmap.md)** — what is shipped, what is next, and which
   candidates were deliberately not taken.

The ADR folder is a history, not a book: after those, open the one a comment or
a commit names. `backend/AGENTS.md`, `frontend/AGENTS.md` and
`client-sdk/AGENTS.md` hold the workspace conventions an editor needs, and
`CONTRIBUTING.md` says where a new rule belongs.

## Ports

| Service     | Local | Docker |
| ----------- | ----- | ------ |
| Backend     | :3000 | :3000  |
| Frontend    | :5173 | :80    |
| RustFS      | :9000 | :9000  |
| RustFS UI   | :9001 | :9001  |
| PDF sidecar | :3001 | :3001  |
| PostgreSQL  | :5432 | :5432  |

## Troubleshooting

**Port already in use**: Stop conflicting services or change ports in `.env.local`.

**Database out of sync**: Run `pnpm run db:prepare` to apply pending migrations. For a new schema change, run `cd backend && pnpm run db:migrate` (creates + applies a migration).

**`prisma migrate dev` reports "migration ... was modified after it was applied"**: the dev database was created from an older revision of the repo (for example before a migration file was force-pushed). Migrations are append-only (ADR-024), so the file is the truth and the recorded checksum is stale. For a disposable database, `./scripts/dev.sh reset` is the clean fix. To keep the data, check that every statement of the migration is reflected in the catalog (columns, constraints, indexes), apply whatever is missing, then set the recorded checksum to the file's hash:

```sql
UPDATE _prisma_migrations
SET checksum = '<sha256 of the migration.sql>'
WHERE migration_name = '<timestamp_name>';
```

Only do that after checking the effects — the checksum describes the file, not the data.

**Pre-commit hook slow**: Only unit tests run on commit. E2E tests run separately via `pnpm run e2eTest`.

## Environment Files

Configuration is resolved in this order (later wins):

1. Defaults at the top of `scripts/dev.sh`
2. `.env` (repo root, gitignored) — loaded by `dev.sh` and Docker Compose
3. `backend/.env` — loaded by the backend runtime, the Prisma CLI and `dev.sh`
4. `backend/.env.local` — loaded before `backend/.env` by the backend runtime, the Prisma CLI and `dev.sh`, so it overrides it (only variables already present in the process environment beat the files)

`dev.sh reset`/`local` creates `backend/.env.local` and `frontend/.env.local` from the git-tracked `.example` files on first run. The backend runtime and the Prisma CLI read `backend/.env.local` themselves, so `pnpm run dev` works on a fresh checkout without exporting variables or symlinking `backend/.env`. Edit these files freely, never commit them.

| File                          | Used by                 | Created by               |
| ----------------------------- | ----------------------- | ------------------------ |
| `backend/.env.local.example`  | —                       | git-tracked template     |
| `backend/.env.local`          | backend runtime, Prisma | `dev.sh` (from template) |
| `frontend/.env.local.example` | —                       | git-tracked template     |
| `frontend/.env.local`         | frontend runtime        | `dev.sh` (from template) |

The backend `.env.local.example` documents every variable (DB, RustFS, CORS, rate limiting, OpenTelemetry); the frontend example only needs `VITE_API_BASE_URL`. The local example ships with `UPLOAD_RATE_LIMIT_PER_MINUTE=0`, because a full `./scripts/dev.sh seed` uploads hundreds of screenshots — the seeds also retry on `429`, so seeding works either way, just slower with the limit enabled.
