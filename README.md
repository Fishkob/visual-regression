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

## Quick Start (self-hosting)

The fastest way to run the platform is Docker — nothing else is required. You
need [Docker](https://docs.docker.com/get-docker/) (Desktop on macOS/Windows,
engine on Linux) with the daemon running.

```bash
git clone https://github.com/Fishkob/visual-regression.git
cd visual-regression
./install.sh            # Docker required — nothing else
```

The installer:

1. Checks Docker + Compose are installed and running.
2. Generates secure random secrets into a gitignored `.env` (Postgres, RustFS,
   admin login, API key) on first run.
3. Builds and starts the full stack, then waits until it is healthy.
4. Prints the URLs and your admin login.

Open the printed **frontend URL** and log in with the printed admin credentials.
Remove `BOOTSTRAP_ADMIN_*` from `.env` after first login.

### Optional: seed demo data

`./install.sh --seed` populates the database with demo projects. Seeding runs
the seed scripts from the repo, so it needs **pnpm** (Node ≥ 24) on the host.
Without pnpm, the installer skips seeding with a hint — you can equally create a
project through the web UI.

> **First build is slow**: the `pdf-sidecar` (Java) and the backend/frontend
> images are compiled from source, which takes several minutes the first time.
> Later builds are fast thanks to Docker layer caching.

### Managing the stack

```bash
./install.sh up      # start / rebuild
./install.sh logs    # follow logs (e.g. ./install.sh logs backend)
./install.sh down    # stop
./install.sh --seed  # add demo data
./install.sh --fresh # wipe all data and start clean
```

> **Lost your `.env`?** Re-running `./install.sh` regenerates it, but an existing
> database volume still holds the old password, so the stack fails to start
> (P1000). Recover with `./install.sh --fresh` — it wipes the volumes and starts
> clean. This erases all data.

### No Docker? Use plain Compose

The same stack runs without the installer wrapper: `docker compose up -d --build`.
If `.env` is missing, copy `.env.example` to `.env` and fill in the secrets.

---

### For contributors (local development with hot reload)

Not running the product? Contributing to the codebase is different — it needs
Node ≥ 24 and pnpm ≥ 10, and hot-reloads backend + frontend:

```bash
# First-time setup: clean slate → infra (postgres, rustfs) → install deps → generate SDK
./scripts/dev.sh reset

# Start backend + frontend with hot reload (starts infra automatically if needed)
pnpm run dev
```

Then open **http://localhost:5173** to see the frontend. See
[docs/local-development.md](docs/local-development.md) for the full reference.

---

### Seed Demo Data (optional)

After the backend is running, populate the database with demo projects and screenshots:

```bash
./scripts/dev.sh seed
```

The seeds hit the authenticated REST API, so they need an API key — create one as described in [CI Authentication](#ci-authentication) below. The seed scripts read `SEED_API_KEY` (or `E2E_API_KEY` for the e2e seeder) from the environment:

- `./scripts/dev.sh seed` sources `backend/.env.local` — set `SEED_API_KEY` there, or set `ADMIN_API_KEY` and `dev.sh` provisions a key automatically via the admin endpoint.
- Running `pnpm run seed:*` directly requires `export SEED_API_KEY=<rawKey>` first, since the scripts don't load dotenv files.

**RustFS Console:** http://localhost:9001 (login: `rustfsadmin` / `rustfsadmin` — the RustFS default root credentials; override via `RUSTFS_ROOT_USER` / `RUSTFS_ROOT_PASSWORD` in the root `.env` for Docker deployments)

---

### CI Authentication

The product API is authenticated. Browsers authenticate with a session cookie (login via the dashboard); CI pipelines and scripted callers authenticate with an **API key**.

**Create an API key** (admin endpoint — requires the `x-admin-key` header set to the configured `ADMIN_API_KEY`):

```bash
curl -X POST http://localhost:3000/api/v1/admin/api-keys \
  -H 'Content-Type: application/json' \
  -H 'x-admin-key: <ADMIN_API_KEY>' \
  -d '{"name":"ci-upload"}'
```

The response contains `rawKey`, which is shown **exactly once** — store it in your CI secret store (only its SHA-256 hash is persisted). Create one key per pipeline/user for easy revocation.

**Send the key on every product API request** via the `x-api-key` header (the header name is configurable via `AUTH_API_KEY_HEADER`):

```bash
curl -X POST "http://localhost:3000/api/v1/projects/my-project/tests/my-test/upload?testKind=image" \
  -H 'x-api-key: <rawKey>' \
  -F 'viewport=desktop' \
  -F 'browser=chromium' \
  -F 'environment=staging' \
  -F 'file=@screenshot.png'
```

The seed scripts authenticate the same way — see [Seed Demo Data](#seed-demo-data-optional) for the exact `SEED_API_KEY` / `E2E_API_KEY` setup.

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

1. **Defaults in `scripts/dev.sh`** — sensible local values (see the `POSTGRES_*` / `RUSTFS_*` vars at the top of the script).
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

For Docker deployments, Compose reads the root `.env` automatically. Set the **production credentials** there so both the servers and the app use the same values — the Compose files interpolate these variables (a mismatch between e.g. the PostgreSQL container and the backend's `DATABASE_URL` silently breaks startup):

| Variable                                              | Controls                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL container + backend connection                                                                                                                              |
| `RUSTFS_ROOT_USER` / `RUSTFS_ROOT_PASSWORD`           | RustFS root credentials (server + app)                                                                                                                                 |
| `RUSTFS_BUCKET`                                       | Storage bucket name                                                                                                                                                    |
| `CORS_ORIGIN`                                         | Allowed browser origins                                                                                                                                                |
| `TRUST_PROXY`                                         | Trust `X-Forwarded-For` from the reverse proxy — set `true` behind nginx/ingress so per-IP throttling and logging see the real client IP (see Security Considerations) |
| `UPLOAD_RATE_LIMIT_PER_MINUTE`                        | Per-API-key upload limit (requests per minute). `0` disables the per-key limit (default: `60`)                                                                         |

The backend creates the storage bucket on startup and, by default, marks it **public-read** (the browser loads screenshots directly from RustFS). Set `RUSTFS_ENSURE_PUBLIC_BUCKET=false` when using a strict S3 provider (e.g. AWS S3 with a public-access block) and configure the bucket policy out-of-band.

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
| `./scripts/dev.sh infra`   | Start infra only (postgres, rustfs, pdf-sidecar)        |
| `./scripts/dev.sh docker`  | Run the full stack in Docker                            |
| `./scripts/dev.sh seed`    | Seed database with demo + e2e + dev data                |
| `./scripts/dev.sh stop`    | Stop Docker services                                    |
| `./scripts/dev.sh reset`   | Full reset: delete → infra → local                      |
| `./scripts/dev.sh delete`  | Stop and remove all data + builds                       |
| `pnpm run bootstrap`       | Install deps + generate SDK + build                     |
| `pnpm run build`           | Build all packages                                      |
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

| Goal                                 | Path                                      | Requires              |
| ------------------------------------ | ----------------------------------------- | --------------------- |
| **Self-hosting** (default)           | `./install.sh`                            | Docker only           |
| **Local development** (hot reload)   | `./scripts/dev.sh reset` → `pnpm run dev` | Docker + Node ≥ 24    |
| **Kubernetes** (Helm chart / ArgoCD) | [docs/deployment.md](docs/deployment.md)  | kubectl + Helm/ArgoCD |

Docker Compose is the self-hosting path — `./install.sh` (or plain
`docker compose up -d --build`) runs the full stack: PostgreSQL, RustFS,
backend, worker, pdf-sidecar, and frontend. Migrations and the RustFS bucket
setup run automatically on startup.

For Kubernetes, a Helm chart ships in `deploy/charts/vrt/` with an ArgoCD
Application manifest and helper scripts in `deploy/scripts/`. That path is
documented separately in [docs/deployment.md](docs/deployment.md).

---

## Security Considerations

This platform is designed to run in a **private/trusted network**:

- **Authentication** — The product API requires a session cookie (browser login) or an API key (`x-api-key`) for CI/scripted callers. See [CI Authentication](#ci-authentication).
- **Admin endpoints** — `POST /admin/api-keys` and `admin/dlq` are protected solely by the `x-admin-key` header (`ADMIN_API_KEY`); they sit outside the product auth surface so a first API key can be provisioned before any product credential exists.
- **Bootstrap admin** — The first admin user is created on startup from `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` (only when both are set). Remove them from the environment after first login.
- **Login throttling** — `/auth/login` is throttled to 5 attempts per minute (`LOGIN_THROTTLE_LIMIT` / `LOGIN_THROTTLE_TTL`) to slow down brute-force attempts.
- **Per-key upload rate limit** — Uploads are limited per API key (`UPLOAD_RATE_LIMIT_PER_MINUTE`, default 60 per minute, fixed window). Exceeding the limit returns `429` with a `Retry-After` header. The counter lives in Postgres, so the limit holds across all backend instances. Browser (session) uploads are not counted per-key; they stay under the global throttle.
- **Reverse proxy / per-IP throttling** — Set `TRUST_PROXY=true` when the backend is served behind the nginx/ingress reverse proxy (`docker-compose`, Helm). Without it Express sees every client as the proxy IP, so the per-IP login/global throttles collapse into a shared budget across all users. Keep it `false` when the backend is directly reachable.
- **Public by design** — Health, metrics, and log-ingestion endpoints are public; everything else is protected by the global authentication guard.
- **CORS defaults to wildcard** — Configure `CORS_ORIGIN` explicitly in production.
- **Helm chart secrets** — Create `deploy/charts/vrt/values.local.yaml` (gitignored) for local credentials. Use external secrets management (SealedSecrets, External Secrets Operator, SOPS) for production.
- **RustFS bucket is publicly readable** — Screenshots are served with anonymous download access. Anyone who can reach RustFS can list and download all screenshots.

See [docs/deployment.md](docs/deployment.md) for production deployment guidance.
