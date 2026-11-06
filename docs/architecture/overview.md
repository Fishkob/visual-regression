# Architecture Overview

## Container View

```mermaid
flowchart TB
    subgraph Clients
        SDK[Client SDK<br/>TypeScript]
        FE[Frontend<br/>Vue 3 + Tailwind]
    end

    subgraph Backend[NestJS Backend]
        API[API Server<br/>REST]
        WORK[Worker<br/>Async Comparison]
        CRON[Cron Job<br/>Stale Data Cleanup<br/>worker mode]

        DATA[Data Access<br/>Repositories + Storage Port]
        API ---|Read/Write| DATA
        WORK --- DATA
        CRON --- DATA

        OTel[OTel SDK]
        Prom[prom-client<br/>Metrics]
        Pino[Pino Logger<br/>JSON]
    end

    subgraph Infrastructure
        DB[(PostgreSQL)]
        S3[(RustFS<br/>S3-compatible)]
        PS[pdf-sidecar<br/>Java 25 + Javalin<br/>PDF Comparison]
    end

    subgraph Observability[Observability — optional]
        Alloy[Grafana Alloy<br/>OTLP + Log Collector]
        Tempo[(Tempo<br/>Trace Storage)]
        Prometheus[Prometheus<br/>Scraper]
        Loki[(Loki<br/>Log Storage)]
        Grafana[Grafana<br/>Dashboards]
    end

    SDK -->|Upload screenshots| API
    FE -->|Browse & approve| API
    WORK -->|poll| DB

    DATA --> DB
    DATA --> S3
    WORK <-->|PDF diff| PS

    OTel -->|OTLP| Alloy
    Alloy --> Tempo
    Alloy -->|span metrics| Prometheus

    Prometheus -->|pull /metrics| Prom

    Alloy -->|collect stdout| Pino
    Alloy --> Loki

    Grafana -->|query| Tempo
    Grafana -->|query| Prometheus
    Grafana -->|query| Loki
```

The `DATA` node is the shared data access layer — API, worker and cron read from and write to PostgreSQL and RustFS through repositories and the `IStorageProvider` port. It is not an event bus: no broker sits between the three processes (see [ADR-004](../adr/004-infrastructure-patterns.md)), and the maintenance cron runs in the worker process (`WorkerModule`), not in the API.

The **Observability box** is optional — those components are only present when they are deployed and configured; the API and worker run without them.

## Backend Layered Architecture

Every feature module under `visualTest/` splits into presentation and application, plus the layers it owns:

```
module/
├── presentation/    HTTP controllers, DTOs, Swagger
├── application/     Orchestration services (use cases)
└── infrastructure/  Prisma repositories, mappers
```

- **`core/domain/`** is the only domain layer — entities, value objects, policies and domain types, shared by all feature modules; `core/` also carries the application services around it (`StateChangeWorkflow`, `BranchResolver`, `ComparisonRetirementService`)
- `intake`, `review`, `catalog`, `runs`, `access` and `notifications` have no `domain/` of their own and use the core domain types; `runs` and `notifications` also skip `infrastructure/` and read through the core repositories
- **Cross-cutting ports** (`IStorageProvider`, `IComparisonEngine`) live in `common/domain/` — infrastructure depends on domain, not the other way around. There is no event bus: observability emission is a synchronous switch in `StateChangeWorkflow`'s post-commit path (see [ADR-004](../adr/004-infrastructure-patterns.md)).
- **Repositories** are injected by class token (no separate interface) — consistent with every other service
- **In-memory test doubles** replace repositories by class token for isolated unit testing

## Module Graph

```mermaid
graph TB
  classDef boundary fill:#f8f9fa,stroke:#868e96,stroke-width:2px,stroke-dasharray:6 3
  classDef external fill:#e7f5ff,stroke:#1c7ed6,stroke-width:1px
  classDef nestjs fill:#fff3e0,stroke:#e67700,stroke-width:2px
  classDef domain fill:#f3f0ff,stroke:#7048e8,stroke-width:1px
  classDef infra fill:#ebfbee,stroke:#2b8a3e,stroke-width:1px
  classDef vue fill:#fff0f6,stroke:#c2255c,stroke-width:1px

  subgraph Browser["Browser"]
    direction LR
    SPA["Vue 3 SPA<br/>TanStack Query<br/>Tailwind v4"]
  end

  subgraph Server["Node.js Server (API :3000 · Worker :3003)"]
    direction TB

    subgraph API["API Mode — AppModule"]
      direction TB
      HTTP["HTTP Layer<br/>Helmet · CORS · Rate Limit<br/>Global ValidationPipe · Exception Filter"]

      subgraph Feature["Feature Module: visualTest/"]
        direction TB
        Intake["Intake<br/>Upload · Job Status"]
        Review["Review<br/>Approvals · Comments · Assignments<br/>Baseline History · Lifecycle"]
        Catalog["Catalog<br/>Projects · Branches · Groups · Search"]
        Runs["Runs<br/>Run Grouping · Trends"]
        Access["Access<br/>Share Links · PDF · Storage"]
        Notifications["Notifications<br/>Webhooks"]
        Core["Core<br/>Entities · Policies<br/>Application Services"]
      end

      subgraph Internal["Internal Modules"]
        Auth["Auth · API Keys<br/>Users · Admin · Audit"]
        Health[Health (/health)]
        Metrics[Metrics (/metrics)]
        Dlq[Dead-Letter Queue]
        LogIng[Log Ingestion]
      end
    end

    subgraph Worker["Worker Mode — WorkerModule"]
      direction TB
      Poller["Job Poller<br/>(Postgres polling)"]
      Processor["Job Processor<br/>ComparisonJobProcessor"]
      Engines["Engines<br/>Pixelmatch (image) · PDF Sidecar Client"]
      Cron["Maintenance Cron<br/>stale data cleanup (daily)"]
    end

    subgraph Shared["Shared Infrastructure"]
      direction TB
      Prisma["Prisma ORM<br/>UnitOfWork · AdvisoryLock<br/>Repositories"]
      Storage["RustFS Storage<br/>IStorageProvider"]
      Obs["Observability<br/>Logger + Metrics (in-process)"]
      JobQ["Job Queue<br/>Postgres-backed"]
      Otel["OpenTelemetry<br/>Traces · Spans"]
    end
  end

  subgraph External["External Systems"]
    PG[("PostgreSQL<br/>Single database")]
    RustfsS3[("RustFS<br/>S3-compatible storage")]
    SidecarSvc["PDF Sidecar Service<br/>(PDF comparison)"]
  end

  SPA -->|HTTP /api/v1/*| HTTP

  HTTP --> Intake
  HTTP --> Review
  HTTP --> Catalog
  HTTP --> Runs
  HTTP --> Access
  HTTP --> Notifications
  HTTP --> Auth

  Intake --> Core
  Review --> Core
  Catalog --> Core
  Runs --> Core
  Access --> Core
  Notifications --> Core

  Core --> Prisma
  Core --> Storage
  Core --> Obs
  Core --> JobQ

  Prisma --> PG
  Storage --> RustfsS3
  JobQ -->|poll| Poller
  Poller --> Processor
  Processor --> Engines
  Engines --> Prisma
  Engines --> Storage
  Engines --> SidecarSvc
  Cron --> Prisma

  Obs --> Otel
  Obs --> Metrics

  class Browser vue
  class API,Worker nestjs
  class Intake,Review,Catalog,Runs,Access,Notifications,Core domain
  class Prisma,Storage,Obs,JobQ,Otel infra
  class External external
```

## Components

| Component                         | Technology                        | Purpose                                                                                               |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Backend API**                   | NestJS + Prisma                   | REST API for visual test management                                                                   |
| **Worker**                        | NestJS (separate app)             | Async image and PDF comparison via PostgreSQL-backed queue                                            |
| **Frontend**                      | Vue 3 + Tailwind + TanStack Query | Dashboard for browsing & approving visual tests                                                       |
| **Client SDK**                    | TypeScript (generated)            | Auto-generated OpenAPI client for CI pipeline uploads                                                 |
| **Database**                      | PostgreSQL                        | Projects, visual tests, screenshots, comparisons, jobs                                                |
| **Storage**                       | RustFS (S3-compatible)            | Screenshot images, diff images                                                                        |
| **Comparison Engine<br/>(Image)** | Pixelmatch                        | Pixel-level image diffing (Node.js, in-worker)                                                        |
| **Comparison Engine<br/>(PDF)**   | pdfcompare (Java)                 | Page-by-page PDF diffing via pdf-sidecar (HTTP)                                                       |
| **Queue**                         | PostgreSQL (polling)              | Async comparison jobs — one `ComparisonJob` table, `testKind` in the job payload and on `UnifiedTest` |
| **Maintenance Cron**              | Cron (`MAINTENANCE_TASKS`)        | Daily cleanup: unreferenced objects, failed jobs, sessions, share links, run history (worker mode)    |
| **OTel SDK**                      | OpenTelemetry JS                  | Generates spans for HTTP requests (optional)                                                          |
| **Grafana Alloy**                 | Grafana Alloy                     | Receives OTLP traces, ships Docker logs to Loki                                                       |
| **Tempo**                         | Grafana Tempo                     | Trace storage (query by TraceID or service graph)                                                     |
| **Prometheus**                    | Prometheus                        | Pulls /metrics endpoint and Alloy span-metrics                                                        |
| **Loki**                          | Grafana Loki                      | Log storage (label-based queries, similar to Prom)                                                    |
| **Grafana**                       | Grafana                           | Unified dashboards for traces, logs & metrics                                                         |

## Data Flow

### Upload Sequence

```mermaid
sequenceDiagram
  participant Client as API Client<br/>(SPA · Client SDK)
  participant API as API (AppModule)
  participant Intake as UploadIntake
  participant Resolver as UploadDecisionResolver
  participant Workflow as StateChangeWorkflow
  participant Repo as Repositories
  participant Storage as RustFS
  participant Queue as Job Queue
  participant Worker as Worker (WorkerModule)
  participant Engine as Comparison Engine

  Client->>API: POST /api/v1/projects/:projectName/tests/:testName/upload
  API->>Intake: upload(params, kind)
  Intake->>Resolver: peekIdentical(params, fileHash)
  alt Hash matches the effective baseline
    Resolver-->>Intake: testId + branch (read-only peek)
    Intake->>Workflow: retire the pending comparison + candidate
    Intake-->>Client: { outcome: IDENTICAL }
  else No effective baseline, or hash differs
    Intake->>Storage: store the upload (quota-charged)
    Intake->>Workflow: executeWithStoredFile(change)
    Workflow->>Resolver: resolveStored(params, fileHash)
    Resolver-->>Workflow: BASELINE_CREATED or COMPARISON_QUEUED
    alt No effective baseline (owned or inherited)
      Workflow->>Repo: write BASELINE screenshot
      Workflow-->>Intake: BASELINE_CREATED
      Intake-->>Client: { outcome: BASELINE_CREATED }
    else Effective baseline differs
      Workflow->>Repo: write CURRENT screenshot
      Workflow->>Queue: enqueue ComparisonJob
      Workflow-->>Intake: COMPARISON_QUEUED
      Intake-->>Client: { outcome: COMPARISON_QUEUED }
    end
    Note over Workflow: The file is stored outside the DB transaction.<br/>If the transaction fails, the stored object is deleted again.
  end

  Queue->>Worker: poll a job (FOR UPDATE SKIP LOCKED)
  Worker->>Engine: compare(baseline, candidate)
  Engine->>Storage: fetch images / render PDF pages
  Engine->>Engine: pixelmatch or pdf-sidecar diff
  alt mismatch == 0
    Worker->>Repo: reclaim candidate (no comparison row)
  else mismatch within threshold
    Worker->>Repo: reclaim candidate — auto-accepted (no comparison row)
  else mismatch above threshold
    Worker->>Storage: store diff image
    Worker->>Repo: write Comparison (PENDING_APPROVAL)
  end
  Worker->>Workflow: apply the change in one transaction
  Workflow->>Repo: recompute the test status from its variants
  Worker-->>Queue: job complete
```

### Image Pipeline

1. **Upload**: CI uploads screenshots via the Client SDK → API resolves the branch's effective baseline and either creates the baseline, answers `identical`, or stores the candidate and queues a `ComparisonJob`
2. **Comparison**: Worker polls the job → pixelmatch diff in-process → a mismatch of 0 or one within the project/variant threshold retires the candidate without a comparison row; above it the worker stores the diff image and writes a `PENDING_APPROVAL` comparison
3. **Approval**: Frontend fetches pending comparisons → user approves → baseline promoted in a transaction and the approval recorded in the audit trail
4. **Baseline**: The approved screenshot becomes that variant's baseline — the next upload on the same branch compares against it

### PDF Pipeline

1. **Upload**: CI uploads PDF documents via the same endpoint (kind `pdf`) → API asks the sidecar for the page count and enforces the page limit before storing anything; the job carries the `pdf` kind in its payload
2. **Comparison**: Worker polls the job → calls pdf-sidecar (HTTP, Java process) → diff image and per-page counts come back the same way they do for images
3. **Approval**: Frontend (or API) fetches pending comparisons → user approves → baseline promoted in a transaction
4. **Baseline**: Approved PDFs become that variant's baseline — the next upload compares against them

## Architecture Philosophy (startup-pragmatic vs. enterprise)

| Area                  | This Platform                                               | Typical Enterprise                          |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| **Queue**             | PostgreSQL polling (single worker)                          | RabbitMQ, SQS, Kafka (multi-worker, DLQ)    |
| **API Surface**       | Monolithic NestJS (one process)                             | API Gateway + BFF + multiple microservices  |
| **Auth**              | Session cookie (dashboard) + API key (CI)                   | OAuth2/OIDC, SSO, RBAC, audit logging       |
| **Multi-tenancy**     | Single-org deployment                                       | Tenant isolation, schema-per-tenant         |
| **Observability**     | OTel traces + Prometheus metrics + Loki logs (all optional) | Distributed tracing, SLIs/SLOs, alerting    |
| **Storage Delivery**  | Presigned, time-limited RustFS URLs                         | CDN + signed URLs + caching layer           |
| **Database Topology** | Single PostgreSQL instance                                  | Read replicas, connection pooling, sharding |
| **Service Mesh**      | None (direct Docker Compose)                                | Istio/Linkerd for mTLS, traffic management  |

**Key tradeoffs made deliberately:**

- Two comparison engines (Pixelmatch + pdfcompare) — image and PDF comparison have fundamentally different algorithms; a separate Java sidecar avoids blocking the Node.js event loop with CPU-bound PDF rendering/compare work
- Redis was removed (see [ADR-004 (Infrastructure Patterns)](../adr/004-infrastructure-patterns.md)) — BullMQ's feature set (priorities, delayed jobs, multi-worker) was overkill for a single-queue system
- No API gateway — one backend serves both the frontend and CI; in the bundled stack the nginx frontend container proxies `/api` and the API port is bound to loopback only
- No multi-tenancy — each deployment serves one organization; self-hosted instances are isolated by deployment
- Single DB instance — read replicas add operational cost with negligible benefit at current scale

The codebase invests complexity where it pays off: **clean layered architecture**, **domain-driven language** (CONTEXT.md), **[architecture decision records](../adr/README.md)** that keep the why next to the seam, **ports-and-adapters** for testability, and a **single transactional write seam** (`StateChangeWorkflow`) instead of a message bus between intake and review.

## Deployment

```mermaid
graph LR
  classDef container fill:#e7f5ff,stroke:#1c7ed6,stroke-width:2px
  classDef infra fill:#fff3e0,stroke:#e67700,stroke-width:1px

  subgraph Docker["docker compose"]
    direction TB
    PROXY["Frontend Container<br/>nginx + SPA — :80"]:::container
    APP["Backend Container<br/>API — :3000"]:::container
    WORKER["Worker Container<br/>comparisons + cron — :3003"]:::container
    SIDECAR["PDF Sidecar<br/>:3001"]:::container
    PG[("PostgreSQL")]:::infra
    RUSTFS["RustFS<br/>:9000"]:::infra
  end

  subgraph Host["Host Machine (dev)"]
    DEV["pnpm run dev<br/>Vite HMR :5173<br/>API :3000 · Worker :3003"]:::container
  end

  PROXY -->|proxy /api| APP
  APP --> PG
  APP --> RUSTFS
  WORKER --> PG
  WORKER --> RUSTFS
  WORKER --> SIDECAR
  DEV -->|local mode: infra only| PG
  DEV -->|local mode: infra only| RUSTFS
  DEV -->|local mode: infra only| SIDECAR
```

## Key Patterns

| Pattern                                  | Where                                                                                                               | Why                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Dual-mode deployment**                 | `AppModule` (API) / `WorkerModule` (worker)                                                                         | Separate concerns — API serves requests, worker processes background comparisons |
| **Strategy pattern**                     | `COMPARISON_ENGINES`, `MAINTENANCE_TASKS`                                                                           | Swap comparison engines or maintenance jobs without editing callers              |
| **Ports & Adapters**                     | `IStorageProvider` → `RustFsStorageService`, `IComparisonEngine` → `PixelmatchComparisonService`/`PdfSidecarClient` | Infrastructure depends on domain, not the other way around                       |
| **Transaction with compensating delete** | `UploadIntake` + `StateChangeWorkflow.executeWithStoredFile`                                                        | Storage write is outside DB transaction; if DB fails, stored file is deleted     |
| **Postgres-backed job queue**            | No Redis/RabbitMQ                                                                                                   | Simplifies ops — one fewer external dependency                                   |
| **Post-commit observability emission**   | `StateChangeWorkflow` switch on `ObservabilityEvent` records                                                        | Logger + metrics emitted directly after commit, no event bus / outbox pattern    |
| **Auto-generated SDK**                   | Prisma → Swagger → OpenAPI → `@hey-api/openapi-ts` → `client-sdk/`                                                  | Single source of truth for API types; zero manual DTO sync                       |
| **Domain-driven frontend**               | `domains/` with model + mapper + query-keys                                                                         | Each backend domain has a mirrored frontend structure                            |
