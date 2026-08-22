# Visual Regression Testing Platform

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/Fishkob/visual-regression/actions/workflows/ci-backend.yml"><img src="https://github.com/Fishkob/visual-regression/actions/workflows/ci-backend.yml/badge.svg" alt="CI (Backend)"></a>
  <a href="https://github.com/Fishkob/visual-regression/actions/workflows/ci-frontend.yml"><img src="https://github.com/Fishkob/visual-regression/actions/workflows/ci-frontend.yml/badge.svg" alt="CI (Frontend)"></a>
</p>

Catch unintended visual changes before they reach production. Upload screenshots from your CI pipeline, compare them pixel-by-pixel against baselines, and approve changes via the web dashboard.

A self-hosted platform for **visual regression testing**, consisting of:

- **Backend** (NestJS + Prisma + RustFS object storage) — manages visual test storage, comparisons, and approvals
- **Frontend** (Vue + Vite + Tailwind) — dashboard for browsing and approving visual tests
- **Client SDK** (TypeScript) — upload screenshots from CI pipelines or automated tests
- **PDF Sidecar** (Java) — PDF comparison via pdfbox
- **Worker** (Node.js) — background comparison job processing

---

## Quick Start

### Requirements

- **Docker & Docker Compose** — start Docker Desktop (or your daemon) before running any of the commands below
- **Node.js ≥ 20.19** (required for local development; the Docker path needs no local Node)
- **pnpm** — only needed for the `pnpm run ...` commands below; `dev.sh` installs it automatically if missing

The Node version is enforced via `engines` (see `.npmrc` `engine-strict=true`); CI runs Node 24 (see `.node-version`).

Choose the path that fits:

| I want to…                                       | Run this                                 |
| ------------------------------------------------ | ---------------------------------------- |
| **Run it in Docker** (no local Node/pnpm)        | `docker compose up -d --build`           |
| **Run it in Docker** (with pnpm installed)       | `pnpm start`                             |
| **Develop locally** (hot reload, first time)     | `pnpm run dev:reset` then `pnpm run dev` |
| **Develop locally** (hot reload, already set up) | `pnpm run dev`                           |

`pnpm start` builds and runs the full stack in Docker (same as `docker compose up -d --build`, but also applies migrations and waits for readiness); `pnpm run dev` starts infra (if not running) and then hot-reloads backend + frontend. All other `dev.sh` commands are also mirrored as `pnpm run dev:*` scripts.

> **No pnpm yet?** Every `pnpm run ...` command above needs pnpm installed first. If you don't have it, call the underlying script directly instead — `./scripts/dev.sh reset` (first-time local setup) or `./scripts/dev.sh docker` (full stack) — and `dev.sh` will install pnpm for you.

---

### Option A: Run it in Docker

```bash
git clone https://github.com/Fishkob/visual-regression.git
cd visual-regression

# Build and start all services in Docker
pnpm start

# Seed demo data (optional)
pnpm run dev:seed
```

> **First build is slow**: the `pdf-sidecar` (Java) and the backend/frontend images are
> compiled from source, which takes several minutes the first time. Later builds are
> fast thanks to Docker layer caching.

Then open **http://localhost** to see the frontend.

> Without Node/pnpm, the same works via plain Docker: `docker compose up -d --build`.

### Option B: Local Development

```bash
git clone https://github.com/Fishkob/visual-regression.git
cd visual-regression

# First-time setup: clean slate → infra (postgres, rustfs) → install deps → generate SDK
pnpm run dev:reset

# Start backend + frontend with hot reload (starts infra automatically if needed)
pnpm run dev
```

Then open **http://localhost:5173** to see the frontend.

---

### Seed Demo Data (optional)

After the backend is running, populate the database with demo projects and screenshots:

```bash
pnpm run dev:seed
```

**RustFS Console:** http://localhost:9001 (login: `minioadmin` / `minioadmin`)

---

### Ports

| Service        | Local Dev                               | Docker                                  |
| -------------- | --------------------------------------- | --------------------------------------- |
| Frontend       | [localhost:5173](http://localhost:5173) | [localhost:80](http://localhost)        |
| Backend        | [localhost:3000](http://localhost:3000) | [localhost:3000](http://localhost:3000) |
| RustFS API     | [localhost:9000](http://localhost:9000) | [localhost:9000](http://localhost:9000) |
| RustFS Console | [localhost:9001](http://localhost:9001) | [localhost:9001](http://localhost:9001) |
| PDF sidecar    | [localhost:3001](http://localhost:3001) | [localhost:3001](http://localhost:3001) |
| PostgreSQL     | localhost:5432                          | localhost:5432                          |

---

### Stop / Clean Up

```bash
./scripts/dev.sh stop       # Stop containers (data persists)
./scripts/dev.sh delete     # Stop + remove volumes + builds
./scripts/dev.sh reset      # Full reset: delete → infra → local (one-command restart)
```

---

## Environment Configuration

Configuration happens through environment variables, resolved in this order (later wins):

1. **Defaults in `scripts/dev.sh`** — sensible local values (see the `POSTGRES_*` / `MINIO_*` vars at the top of the script).
2. **`.env`** (repo root, gitignored) — loaded by `dev.sh` and Docker Compose.
3. **`backend/.env`** — loaded by `dev.sh` after the root `.env`.

The **local dev** flow creates `backend/.env.local` and `frontend/.env.local` from the `.example` files on first run (via `dev.sh reset`/`local`). Override them per-machine without touching git-tracked files.

| File                  | Used by           | Created by                 |
| --------------------- | ----------------- | -------------------------- |
| `.env` (root)         | `dev.sh`, Compose | you (optional)             |
| `backend/.env`        | `dev.sh`          | you (optional)             |
| `backend/.env.local`  | backend runtime   | `dev.sh` (from `.example`) |
| `frontend/.env.local` | frontend runtime  | `dev.sh` (from `.example`) |
| `.env.local` examples | —                 | git-tracked templates      |

For Docker deployments, Compose reads root `.env` automatically (defaults cover everything except production credentials).

---

## Architecture

```
visual-regression/
├── backend/         # NestJS API server + cron jobs
├── frontend/        # Vue 3 + Tailwind dashboard
├── client-sdk/      # TypeScript SDK for CI pipeline uploads
├── pdf-sidecar/     # Java service for PDF comparison
├── docker-compose.yml           # Full stack
├── docker-compose.infra.yml     # Infra only (postgres, rustfs)
└── scripts/dev.sh               # Development orchestration
```

**Data flow:**

1. **Upload** — CI pipeline uploads screenshots or PDFs via Client SDK → Backend stores in RustFS
2. **Comparison** — Backend creates comparison job in PostgreSQL → Worker picks up → pixelmatch diff (or pdf-sidecar for PDFs) → stores result
3. **Approval** — Frontend fetches pending comparisons → User approves → Baseline promoted
4. **Baseline** — Approved screenshots become the new baseline for future comparisons

See [docs/architecture/overview.md](docs/architecture/overview.md) for detailed architecture. See [docs/observability.md](docs/observability.md) for the optional OpenTelemetry / Prometheus / Grafana stack.

---

## Testing

Unit tests run without infrastructure:

```bash
pnpm run unitTest                  # Backend unit tests
pnpm run unitTest:cov              # Backend unit tests with coverage
cd frontend && pnpm test           # Frontend unit tests
```

Backend E2E starts the required infrastructure (Postgres, RustFS, pdf-sidecar)
automatically if it is not already running:

```bash
pnpm run e2eTest
```

Frontend E2E (Playwright) drives a browser against the full stack and needs
the frontend, backend, worker, and pdf-sidecar:

```bash
cd frontend && pnpm test-e2e
```

### Frontend E2E: Starting the Stack

Before the first run, start the full stack in Docker (CI does the same):

```bash
./scripts/dev.sh docker            # or: docker compose up -d
```

Install the Playwright browser once:

```bash
cd frontend && pnpm exec playwright install chromium
```

Expected running services (`docker compose ps`):

```text
postgres, rustfs, pdf-sidecar, backend, worker, frontend
```

The worker and pdf-sidecar are mandatory: the worker runs image comparisons
and orchestrates PDF comparisons, which delegate the heavy lifting to the
pdf-sidecar. Without them, comparison jobs produce no result and the tests
time out.

The Playwright run targets `http://localhost:80` by default (or the URL in
the `FRONTEND_URL` environment variable).

### Test Isolation

The E2E tests do not interfere with each other, even across repeated,
back-to-back runs:

- **Unique project names** — each test creates its own project
  (e.g. `e2e-image-<timestamp>-<random>`), so runs never collide.
- **Self-cleanup** — after each test, `afterEach` deletes the project it
  created, leaving no data behind.
- **Sequential execution** — CI enforces `--workers=1` (in
  `playwright-e2e.config.ts`); running locally with the same flag keeps the
  shared worker free of competing upload+compare load.

---

## Development Commands

| Command                    | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `pnpm start`               | Run the full stack in Docker                            |
| `pnpm run dev`             | Start infra (if needed) + backend/frontend (hot reload) |
| `pnpm run dev:backend`     | Backend only                                            |
| `pnpm run dev:frontend`    | Frontend only                                           |
| `pnpm run dev:infra`       | Start infra only (postgres, rustfs, pdf-sidecar)        |
| `pnpm run dev:docker`      | Run the full stack in Docker (alias for `pnpm start`)   |
| `pnpm run dev:seed`        | Seed database (alias for `./scripts/dev.sh seed`)       |
| `pnpm run dev:stop`        | Stop Docker services                                    |
| `pnpm run dev:reset`       | Full reset: delete → infra → local                      |
| `pnpm run dev:delete`      | Stop and remove all data + builds                       |
| `pnpm run bootstrap`       | Install deps + generate SDK + build                     |
| `pnpm run build`           | Build all packages                                      |
| `./scripts/dev.sh seed`    | Seed database with demo + e2e + dev data                |
| `pnpm run sdk:generate`    | Generate client SDK from OpenAPI                        |
| `pnpm run db:prepare`      | Generate Prisma client + apply migrations               |
| `cd backend && pnpm db:ui` | Open Prisma Studio                                      |

See [docs/local-development.md](docs/local-development.md) for a full reference.

---

## Code Quality

```bash
pnpm run lint              # Backend lint + fix
pnpm run typecheck:all     # Backend + test + frontend type check
pnpm run format            # Format all code
pnpm run format:check      # Check formatting only
```

Recommended order: `lint` → `typecheck:all` → `format` → `unitTest`

---

## Deployment

Three run modes, depending on your goal:

| Goal                                 | Path                                         | Requires              |
| ------------------------------------ | -------------------------------------------- | --------------------- |
| **Local development** (hot reload)   | `pnpm run dev:reset` → `pnpm run dev`        | Docker + Node ≥ 20.19 |
| **Self-hosted with Docker Compose**  | `pnpm start`                                 | Docker only           |
| **Kubernetes** (Helm chart / ArgoCD) | see [docs/deployment.md](docs/deployment.md) | kubectl + Helm/ArgoCD |

### Docker Compose (self-hosted)

`pnpm start` builds and runs the full stack (PostgreSQL, RustFS, backend, worker, pdf-sidecar, frontend) with a single command. Migration and RustFS bucket setup run automatically on startup. This is the recommended production-like deployment for a single host.

```bash
pnpm start
pnpm run dev:seed    # optional demo data
```

To deploy with plain `docker compose` instead (no pnpm/Node needed):

```bash
docker compose up -d --build
```

Set production credentials (DB password, RustFS keys) via the root `.env` file — see [Environment Configuration](#environment-configuration).

### Kubernetes (Helm / ArgoCD)

A Helm chart ships in `deploy/charts/vrt/`, with an ArgoCD Application manifest and helper scripts in `deploy/scripts/`. It deploys the same stack plus an ingress, optional HPA/PDB, NetworkPolicy, and a `db-migrate` job that applies the schema before the backend starts.

```bash
# k3s quickstart (single-node cluster, interactive credentials)
./deploy/scripts/setup-k3s.sh

# Deploy via Helm
./deploy/scripts/deploy.sh

# Or via ArgoCD
./deploy/scripts/install-argocd.sh
```

**DNS is required**: the chart routes `vrt.local` (frontend) and `rustfs.vrt.local` (RustFS) through the ingress — add a wildcard `*.vrt.local` DNS entry or `/etc/hosts` lines for test machines, otherwise images won't load.

> **Image registry**: the chart pulls images from `ghcr.io/fishkob/*`. On a fresh clone you need pull access to those images, or re-point `repository` in `deploy/charts/vrt/values.yaml` to images you own.

See [docs/deployment.md](docs/deployment.md) for full details, including connecting an external PostgreSQL instance.

---

## Security Considerations

This platform is designed to run in a **private/trusted network**:

- **No authentication** — All API endpoints are public. Do not expose to the internet without a reverse proxy.
- **CORS defaults to wildcard** — Configure `CORS_ORIGIN` explicitly in production.
- **Helm chart secrets** — Create `deploy/charts/vrt/values.local.yaml` (gitignored) for local credentials. Use external secrets management (SealedSecrets, External Secrets Operator, SOPS) for production.
- **RustFS bucket is publicly readable** — Screenshots are served with anonymous download access. Anyone who can reach RustFS can list and download all screenshots.

See [docs/deployment.md](docs/deployment.md) for production deployment guidance.
