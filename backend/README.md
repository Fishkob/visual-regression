# Visual Regression Backend – Production Setup

A self-hosted backend for visual regression testing built with **NestJS**, **Prisma**, and **MinIO**.  
It provides REST APIs for screenshot uploads, visual comparisons, and baseline management.  
The backend can run locally or in production using **Docker Compose**.

---

## 1. Project Overview

```
.
├── backend/            # NestJS backend (API, Prisma)
├── frontend/           # Vue 3 frontend (Tailwind)
├── client-sdk/         # Generated OpenAPI client
├── scripts/            # Dev scripts (dev.sh)
├── docker-compose.yml  # Full stack (infra + services)
├── docker-compose.infra.yml  # Infrastructure only
└── package.json        # Root workspace controller
```

This repository uses **pnpm workspaces**. Build and run instructions follow below.

| Variable                      | Description                                                             | Default                 |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------- |
| `POSTGRES_HOST`               | Database host                                                           | `localhost`             |
| `POSTGRES_PORT`               | Database port                                                           | `5432`                  |
| `POSTGRES_USER`               | Database user                                                           | `postgres`              |
| `POSTGRES_PASSWORD`           | Database password                                                       | `postgres`              |
| `POSTGRES_DB`                 | Database name                                                           | `vrt`                   |
| `MINIO_ENDPOINT`              | Storage host                                                            | `localhost`             |
| `MINIO_PORT`                  | Storage port                                                            | `9000`                  |
| `MINIO_ACCESS_KEY`            | Storage access key                                                      | `minioadmin`            |
| `MINIO_SECRET_KEY`            | Storage secret key                                                      | `minioadmin`            |
| `MINIO_BUCKET`                | Storage bucket                                                          | `vrt`                   |
| `MINIO_USE_SSL`               | Use SSL                                                                 | `false`                 |
| `MINIO_PUBLIC_URL`            | Public URL                                                              | `http://localhost:9000` |
| `CORS_ORIGIN`                 | Allowed CORS origins                                                    | `http://localhost:5173` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint for OpenTelemetry tracing (optional — empty = no tracing) | `""`                    |

For Docker, these are set automatically in `docker-compose.yml`.

---

## 2. OpenTelemetry Tracing (optional)

The backend can export OpenTelemetry traces when the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable is set (e.g. `http://localhost:4318/v1/traces`). When unset, tracing is completely disabled — no network traffic, no dependencies.

What gets traced:

- **HTTP requests** — every API call produces a span with method, route, status code, and duration
- **Trace ID** — the `X-Trace-Id` response header carries the OpenTelemetry trace ID instead of a UUID

Traces are typically sent to an **OpenTelemetry Collector**, which batches and forwards them to Tempo, Jaeger, or another trace backend. For local development a full observability stack is available in `docker-compose.observability.yml` (Grafana + Tempo + Loki + Prometheus). It is **not** started automatically — only on demand:

```bash
docker compose -f docker-compose.observability.yml up -d
```

---

## 3. Build the Backend

To create a production build:

```bash
cd backend
pnpm install
pnpm run build
```

The compiled output will be placed in `backend/dist/`.

Start the server:

```bash
pnpm run start:prod
```

Or directly with Node:

```bash
node dist/main.js
```

---

## 4. Docker Compose Setup (Production)

A production-ready Docker Compose file is available at the repository root:

```bash
# Start all services
docker compose up -d --build
```

This starts PostgreSQL, MinIO, the backend API, worker, and frontend.

For a minimal setup (infrastructure only):

```bash
docker compose -f docker-compose.infra.yml up -d
```

---

## 5. Prepare the Database

Apply Prisma schema:

```bash
docker compose exec backend npx prisma migrate deploy
```

or locally:

```bash
cd backend
npx prisma migrate deploy
```

---

## 6. Development Scripts

Use the root `dev.sh` script for development:

```bash
# Start everything (Docker)
./scripts/dev.sh docker

# Start with test data
./scripts/dev.sh seed

# Stop containers
./scripts/dev.sh stop

# Delete everything
./scripts/dev.sh delete
```

For local development with hot reload:

```bash
# Start infrastructure only
docker compose -f docker-compose.infra.yml up -d

# Start backend + frontend with hot reload
pnpm run dev
```

---

## 7. Accessing the API

Default base URL:

```
http://localhost:3000/api/v1
```

| Endpoint                   | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `GET /api/v1/health`       | Full health check (database, storage, queues, worker, sidecar) |
| `GET /api/v1/health/live`  | Liveness probe (process up)                                    |
| `GET /api/v1/health/ready` | Readiness probe (same payload as `/health`)                    |
| `GET /api/v1/health/db`    | Database status                                                |
| `GET /api/v1/health/minio` | Storage status                                                 |
| `GET /api/v1/docs`         | Swagger documentation                                          |

Example:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response (`DetailedHealthDto`; `worker`/`pdf-sidecar` are `skipped` when their URLs are not configured):

```json
{
  "status": "ok",
  "results": {
    "database": "ok",
    "storage": "ok",
    "queues": "ok",
    "worker": "ok",
    "pdf-sidecar": "ok"
  },
  "timestamp": "2026-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "buildInfo": {
    "version": "1.0.0",
    "commitHash": "abc123",
    "buildTime": "2026-01-01T00:00:00.000Z",
    "nodeVersion": "v24.0.0"
  },
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latencyMs": 3 },
    "storage": { "status": "ok", "latencyMs": 4 },
    "queues": {
      "status": "ok",
      "latencyMs": 2,
      "details": { "pending": 0, "processing": 0, "failed": 0 }
    },
    "worker": { "status": "ok", "latencyMs": 5 },
    "pdf-sidecar": { "status": "ok", "latencyMs": 6 }
  }
}
```

---

## 8. Production Checklist

| Area          | Task                                     |
| ------------- | ---------------------------------------- |
| `.env`        | Set production credentials (DB, Storage) |
| Prisma        | Run `npx prisma migrate deploy`          |
| Docker        | Use `docker-compose.yml`                 |
| Logging       | JSON logs via `nestjs-pino` for ELK/Loki |
| Monitoring    | `/api/v1/health` endpoints for probes    |
| Reverse Proxy | Use Nginx/Traefik for HTTPS termination  |

---

## 9. Complete Startup Flow

```bash
# 1. Clone repository
git clone https://github.com/Fishkob/visual-regression.git
cd visual-regression

# 2. Create environment file
cp backend/.env.local.example backend/.env.local  # adjust values

# 3. Start containers and backend
docker compose up -d --build

# 4. Run database setup
docker compose exec backend npx prisma migrate deploy

# 5. Verify system health
curl http://localhost:3000/api/v1/health
```

You should see a `DetailedHealthDto` with `"status": "ok"` (see [Accessing the API](#7-accessing-the-api)).

---

### Summary

| Purpose            | Command                                            |
| ------------------ | -------------------------------------------------- |
| Start infra        | `docker compose -f docker-compose.infra.yml up -d` |
| Local development  | `pnpm run dev`                                     |
| Start all (Docker) | `./scripts/dev.sh docker`                          |
| Build backend      | `pnpm run build`                                   |
| Run tests          | `pnpm run test`                                    |
| Health check       | `curl http://localhost:3000/api/v1/health`         |

---

## Additional Scripts

```bash
# Lint
pnpm run lint

# Type check
pnpm run typecheck

# Format
pnpm run format
```
