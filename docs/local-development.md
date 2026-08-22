# Local Development Guide

## Prerequisites

- Docker & Docker Compose
- **Node.js ≥ 20.19** (enforced via `engines`; CI runs Node 24, see `.node-version`)
- pnpm (auto-installed by `dev.sh` if missing)

## First-time Setup

```bash
# 1. Install pnpm if you don't have it
npm install -g pnpm

# 2. Full reset: clean everything → start infra → install deps
pnpm run dev:reset
```

This runs `delete` (clean slate) → `infra` (postgres + minio in Docker) → `local` (pnpm install, prisma generate, migrate dev, SDK generation).

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
| Start infra only               | `pnpm run dev:infra`                              |
| Stop all Docker services       | `pnpm run dev:stop`                               |
| Full clean restart             | `pnpm run dev:reset`                              |
| Nuke everything                | `pnpm run dev:delete`                             |
| Seed test data                 | `pnpm run dev:seed`                               |
| Open database UI               | `pnpm run db:prepare && cd backend && pnpm db:ui` |
| Generate SDK                   | `pnpm run sdk:generate && pnpm run sdk:build`     |

## Testing

### Unit tests

No infrastructure required:

```bash
pnpm run unitTest                  # Backend unit tests
pnpm run unitTest:cov              # Backend unit tests with coverage
cd frontend && pnpm test           # Frontend unit tests
```

### Backend E2E

Starts the required infrastructure (Postgres, MinIO, pdf-sidecar)
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
#    docker compose ps should show: postgres, minio, pdf-sidecar,
#    backend, worker, frontend (one-shot db-migrate/minio-init exit)

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
├── docker-compose.yml         # Full stack (postgres, minio, backend, worker, frontend)
├── docker-compose.infra.yml   # Infra only (postgres, minio)
├── scripts/dev.sh             # Main dev orchestration
├── backend/                   # NestJS + Prisma
├── frontend/                  # Vue 3 + Vite + Tailwind
└── client-sdk/                # Generated TypeScript SDK
```

## Ports

| Service     | Local | Docker |
| ----------- | ----- | ------ |
| Backend     | :3000 | :3000  |
| Frontend    | :5173 | :80    |
| MinIO       | :9000 | :9000  |
| MinIO UI    | :9001 | :9001  |
| PDF sidecar | :3001 | :3001  |
| PostgreSQL  | :5432 | :5432  |

## Troubleshooting

**Port already in use**: Stop conflicting services or change ports in `.env.local`.

**Database out of sync**: Run `pnpm run db:prepare` to apply pending migrations. For a new schema change, run `cd backend && pnpm run db:migrate` (creates + applies a migration).

**Pre-commit hook slow**: Only unit tests run on commit. E2E tests run separately via `pnpm run e2eTest`.

## Environment Files

Configuration is resolved in this order (later wins):

1. Defaults at the top of `scripts/dev.sh`
2. `.env` (repo root, gitignored) — loaded by `dev.sh` and Docker Compose
3. `backend/.env` — loaded by `dev.sh` after the root `.env`

`dev.sh reset`/`local` creates `backend/.env.local` and `frontend/.env.local` from the git-tracked `.example` files on first run. Those are per-machine overrides for the backend/frontend runtimes — edit them freely, never commit them.

| File                          | Used by          | Created by               |
| ----------------------------- | ---------------- | ------------------------ |
| `backend/.env.local.example`  | —                | git-tracked template     |
| `backend/.env.local`          | backend runtime  | `dev.sh` (from template) |
| `frontend/.env.local.example` | —                | git-tracked template     |
| `frontend/.env.local`         | frontend runtime | `dev.sh` (from template) |

The backend `.env.local.example` documents every variable (DB, MinIO, CORS, rate limiting, OpenTelemetry); the frontend example only needs `VITE_API_BASE_URL`.
