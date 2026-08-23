# ADR 013: Backend Structure — Module Architecture and Worker/API Separation

## Status

Accepted — 2026-05-23 (all original decisions)

Updated — 2026-06-13: renamed `shared/` → `core/`, removed repository ports, using class injection uniformly

Supersedes: ADR-007 (VisualTest Module Split), ADR-008 (Repository Ports), ADR-012 (Public/Internal Boundary), ADR-013 (Worker/API Separation), ADR-017 (Backend Module Architecture)

## Context

This ADR consolidates five interdependent decisions that were made incrementally:

- **ADR-007**: The `visualTest` module was split into `intake/`, `review/`, `shared/` sub-modules
- **ADR-008**: Repository ports with injection tokens to decouple services from Prisma
- **ADR-012**: The `public/` vs `internal/` top-level boundary
- **ADR-013**: Worker/API process separation
- **ADR-017**: Backend module architecture (consolidation of ADR-007, ADR-008, ADR-012)

The June 2026 update: Repository ports were removed. All four visual test repository ports (`core/domain/ports/`) had exactly one adapter each — no polymorphism existed or was planned. The port pattern added 185 lines of boilerplate (interfaces + token constants) and required editing two files per method change. Repositories now use the same class-token injection as every other service in the codebase.

---

## 1. Public/Internal Module Boundary

### Decision

Modules live in `modules/` under two top-level directories:

- **`modules/public/*`** — Domain modules that own business concepts from CONTEXT.md (e.g., `visualTest` owns Project, VisualTest, Screenshot, Comparison). These modules implement application services, domain logic, and expose HTTP endpoints. They follow an `application/domain/infrastructure/presentation/` layout.

- **`modules/internal/*`** — Infrastructure modules that provide capabilities consumed by public modules (e.g., `storage`, `comparison-engine`, `metrics`, `health`, `data-deletion`). These are thin — typically a single service behind a port from `common/domain/`. They do not own domain concepts, do not expose domain entities, and do not have their own domain layer. Internal modules can be swapped out without affecting the domain model.

- **`common/`** — Shared cross-cutting concerns that both public and internal modules depend on: domain interfaces (`IStorageProvider`, `IComparisonEngine`; `IEventBus` was removed on 2026-08-05 — see [ADR-004](./004-infrastructure-patterns.md)), base types (`DomainError`, `VariantRecord`, `UploadOutcome`), the observability-event type, infrastructure (`tracker`, `logging`, `http`).

Internal modules must not import from public modules — the dependency arrow always points internal → public.

**Exception:** Internal modules may import `VisualTestInfraModule` to consume the seam tokens it provides (e.g. `STORAGE_OBJECT_REFERENCEDNESS`, `ORPHAN_SWEEP`, or shared repository classes). Internal modules must not import domain entities, application services, or other public module types — only the seam/repository classes and their provider tokens.

---

## 2. VisualTest Module Split

### Decision

The `visualTest` module at `modules/public/visualTest/` was split into three sub-modules:

- **`intake/`** — Upload, screenshot creation, queuing, job polling, comparison execution
- **`review/`** — Approval, status, thresholds, reads, project management
- **`core/`** — Cross-cutting entities, policies, base classes, types, repository implementations. Originally named `shared/`; renamed on 2026-06-11 to communicate purpose over usage.

Consolidations applied during the split:

| Before                                  | After                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6 use cases (single-method classes)     | Methods on the relevant application service                                                                                                                               |
| `VisualTestFacade`                      | Removed — services are injected directly                                                                                                                                  |
| 3 finder repositories                   | Folded into `UnifiedComparisonsRepository` and `UnifiedTestRepository`                                                                                                    |
| 3 mapper layers (Prisma → Entity → DTO) | 3 mappers in `core/infrastructure/mappers/` + `review/infrastructure/mappers/` (Prisma → Entity: comparison + screenshot; Entity → DTO: comparison-dto, pdf-test-details) |
| Flat NestJS module                      | No wrapper module — `AppModule` imports sub-modules directly (`VisualTestApplicationModule`, `IntakeApplicationModule`, `ReviewModule`)                                   |

Three mappers were retained because Prisma → Entity (infrastructure mapping, `core/infrastructure/mappers/`) and Entity → DTO (API shaping, `review/infrastructure/mappers/`) serve distinct responsibilities. Consolidating to one would couple DB schema to API contracts.

---

## 3. Repository Class Injection

### Decision

Repositories are registered and injected by class token — the same pattern used by every application service. No separate port interface files exist. Consumers declare the repository class directly in their constructor:

```typescript
constructor(
  private readonly comparisons: ComparisonsRepository,
  private readonly screenshots: ScreenshotRepository,
) {}
```

All six repository implementations live in `core/infrastructure/repositories/` and are registered in `VisualTestInfraModule` (the directory additionally holds `StorageObjectReferencednessService` — the `STORAGE_OBJECT_REFERENCEDNESS` seam consumed by internal modules, see the Internal/Public boundary below):

| Repository                     | Registered In           | Notes                                                             |
| ------------------------------ | ----------------------- | ----------------------------------------------------------------- |
| `UnifiedScreenshotRepository`  | `VisualTestInfraModule` |                                                                   |
| `UnifiedComparisonsRepository` | `VisualTestInfraModule` |                                                                   |
| `UnifiedTestRepository`        | `VisualTestInfraModule` |                                                                   |
| `ProjectRepository`            | `VisualTestInfraModule` |                                                                   |
| `VariantStore`                 | `VisualTestInfraModule` | Variant↔baseline lookups, composed by screenshot/comparison repos |
| `OrphanedScreenshotRepository` | `VisualTestInfraModule` | Encodes the orphan-screenshot definition for maintenance cleanup  |

The review module additionally registers two read-only repositories in `review/infrastructure/repositories/` — `TestReadRepository` (test-scoped reads: details, PDF sources/ownership, test listing, pending list) and `ProjectReadRepository` (project overview statuses, pending flags/counts). There is no repository facade class — consumers inject the concrete repository classes they need, as described below.

Cross-cutting shared services (e.g., `TestResolver`, `TestDeletionService`) also live in `core/application/services/` and are registered in `VisualTestApplicationModule`.

The `core/domain/ports/` directory was deleted on 2026-06-13 — all four repository ports had exactly one adapter each and the interface maintenance cost (185 lines of boilerplate, dual-file edits per method change) exceeded the documentation benefit. Tests provide mock objects under the class token (`{ provide: ComparisonsRepository, useValue: mock }`), which works identically to string-token injection.

#### Why not `@Global()` for domain modules

`VisualTestInfraModule` is not `@Global()` — all dependencies are explicit. Originally `SharedModule` (now `core/`) was `@Global()` to paper over a circular import. Moving all repository implementations into `core/infrastructure/repositories/` broke the cycle cleanly. The `@Global()` pattern was fragile: removing it would silently break injection in any consumer.

Domain modules must never be `@Global()`. Every domain dependency must be declared in `imports`.

#### Approved `@Global()` modules

The following infrastructure modules are `@Global()` because they are genuinely cross-cutting — removing `@Global()` would require every single module in the application to declare an explicit import for a non-domain concern. These form a fixed set; adding a new `@Global()` module requires justification in this ADR.

| Module                 | File                                      | Rationale                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AppLoggerModule**    | `common/logging/app-logger.module.ts`     | Logging is injected in 17+ services, pipes, interceptors, filters, cron jobs, and infrastructure code. Explicit imports would add noise to nearly every module.                                    |
| **LoggerConfigModule** | `config/logger-config.module.ts`          | Configures Pino logger settings once at application startup. Zero direct consumers — purely initialization.                                                                                        |
| **TrackerModule**      | `common/tracker/tracker.module.ts`        | Request/operation tracing used across domain boundaries (upload, approval, worker, job queue). 4 consumers spread across intake, review, and internal modules.                                     |
| **MetricsBaseModule**  | `internal/metrics/metrics-base.module.ts` | Metrics infrastructure (counters, histograms) used by the job queue, tracker, UoW, HTTP interceptor, and maintenance cron. 8+ injection sites spanning `common/`, `prisma/`, and internal modules. |

The former `EventBusModule` was removed on 2026-08-09 — observability emission is now a synchronous switch in `StateChangeWorkflow`'s post-commit path (see ADR-004 §3), so there is no event-bus module left to make global.

To add a new `@Global()` module, update this table with rationale. If the count reaches 8+, re-evaluate whether the implicit dependency graph is undermining the architecture's self-documenting property.

---

## 4. Dependency Graph

```
AppModule (API mode — main.ts)
  imports: [CoreInfrastructureModule, ThrottleConfigModule, ScheduleModule.forRoot(),
            VisualTestApplicationModule, IntakeApplicationModule, ReviewModule,
            HealthModule, LogIngestionModule, DlqModule, DataDeletionModule]

WorkerModule (worker mode — worker.module.ts)
  imports: [CoreInfrastructureModule, IntakeWorkerModule]

CoreInfrastructureModule
  imports: [AppLoggerModule, LoggerConfigModule, TrackerModule,
            MetricsBaseModule, ConfigModule, AppConfigModule, StorageModule, PrismaModule]

VisualTestInfraModule
  imports: [PrismaModule]                      ← no sub-module imports

VisualTestApplicationModule
  imports: [VisualTestInfraModule, PrismaModule, StorageModule, JobQueueModule]
  providers: [TestResolver, TestStatusService, TestDeletionService,
              ComparisonRetirementService, CandidateReclamationService,
              StateChangeWorkflow, ThresholdUpdateService]

IntakeApplicationModule
  imports: [AppConfigModule, MulterModule, PrismaModule, StorageModule,
            VisualTestInfraModule, JobQueueModule, VisualTestApplicationModule,
            PdfSidecarModule]
  controllers: [UploadController]              ← API-only: controller + pipelines

IntakeWorkerModule
  imports: [AppConfigModule, PrismaModule, StorageModule,
            VisualTestInfraModule, VisualTestApplicationModule, ComparisonEngineModule,
            JobQueueModule]
  providers: [ComparisonJobProcessor, ComparisonJobPoller,
              WorkerHealthServer]   ← worker-only seam

ReviewModule
  imports: [PrismaModule, StorageModule, VisualTestInfraModule,
            VisualTestApplicationModule, PdfSidecarModule]
  controllers: [ProjectsController, ApprovalsController, TestsQueriesController,
                PdfController, TestCommandsController]
```

Note: the `MulterModule` in `IntakeApplicationModule` is registered with a `useFactory` that reads `screenshotMaxSize` from `AppConfigService`, and the `PdfSidecarModule` is imported by `IntakeApplicationModule` (for PDF page counts) and `ReviewModule` (for PDF render/download). Maintenance crons (see `DataDeletionModule`) run only in the API process — `AppModule` mounts `ScheduleModule.forRoot()` for them; the worker graph contains no cron jobs and does not mount `ScheduleModule`. The API adds `ThrottleConfigModule` for request throttling. `VisualTestInfraModule` and `VisualTestApplicationModule` are imported independently by consumers — there is no composing wrapper module.

No `forwardRef()` is needed — the import graph is acyclic.

---

## 5. Worker/API Process Separation

### Context

The backend has two entry points: `main.ts` (NestJS `AppModule` — full API with controllers) and `worker.module.ts` (`WorkerModule` — no controllers, only queue polling and background job processing). The worker process imports `IntakeWorkerModule` (for `ComparisonJobPoller` and `ComparisonJobProcessor`) instead of `IntakeModule` — preventing the `ScreenshotsController` and its lifecycle hooks from loading in worker mode.

### Decision

The API and worker run as separate processes sharing the same codebase, database, and storage:

- **`AppModule`** (`main.ts`) — HTTP API server. Imports `CoreInfrastructureModule`, `VisualTestApplicationModule`, `IntakeApplicationModule`, `ReviewModule`, `HealthModule`, `DataDeletionModule`, `DlqModule`, `LogIngestionModule`.
- **`WorkerModule`** (`worker.module.ts`) — Background job consumer. Imports `CoreInfrastructureModule` and `IntakeWorkerModule`. No controllers, no HTTP stack. The `ComparisonJobPoller` runs as a polling loop processing `ComparisonJob` records from the database queue.

Both processes share `PrismaModule`, `StorageModule`, and the remaining `CoreInfrastructureModule` modules. The worker receives `ComparisonEngineModule` transitively through `IntakeWorkerModule`.

### Rationale

- **No HTTP overhead in workers**: The worker process doesn't load Express/Koa, HTTP middleware, guards, interceptors, or controllers — reducing memory and startup time.
- **Independent scaling**: The API can scale horizontally for request volume while the worker scales for queue depth. A spike in uploads doesn't degrade API latency.
- **Separation of failure domains**: An unhandled error in a background job can crash the worker without affecting API availability, and vice versa.
- **Deployment flexibility**: The worker can have different resource profiles (more CPU for pixel comparison, less memory) and different health-check/restart policies.

### Consequences

- Adding an endpoint-adjacent feature that also needs background processing must touch both modules (e.g., a new job type needs a handler in `IntakeWorkerModule` and an endpoint in `ReviewModule`).
- Worker-specific providers live in `IntakeWorkerModule`, not in `IntakeApplicationModule`. This prevents the `ComparisonJobPoller` from starting in API mode. Adding a new worker concern means adding it to `IntakeWorkerModule` — not to `IntakeApplicationModule`.
- `ComparisonEngineModule` is imported by `IntakeWorkerModule`, not by `WorkerModule` directly. The dependency is explicit at the worker-seam level.
- There are two `nest-cli.json` build configurations or a single build with multiple entry points.

---

## Rationale (overall)

- **Separation of concerns**: Public modules model the domain; internal modules provide machinery. A developer working on "comparison approval" does not need to understand RustFS.
- **Locality**: Tracing "what happens on approval" visits 2–3 files instead of 5+.
- **Leverage**: Fewer interfaces with the same behavior. Consolidating 6 use case classes into service methods removed boilerplate without losing clarity.
- **Testability**: Tests exercise service methods directly rather than orchestrating mocked facades. Repository class tokens let tests substitute mocks without coupling to constructor details.
- **Replaceability**: Swapping RustFS for AWS S3, or pixelmatch for a cloud vision API, requires changing only the internal module — the domain is insulated.
- **Consistency**: The port + token pattern is uniform across storage, repositories, event bus, unit of work, and comparison engine.
- **Explicit dependencies**: The `@Global()` exception is limited to genuinely cross-cutting infrastructure. Domain modules always declare their imports explicitly — the architecture is self-documenting.

## Consequences (overall)

- New domain modules belong in `modules/public/`, new infrastructure modules in `modules/internal/`.
- Adding a repository method requires updating only the implementation — no separate interface to maintain.
- Repository contracts are documented by the class's public methods rather than a separate interface file.
- Cross-cutting application services belong in `core/application/services/` and are registered in `VisualTestApplicationModule`.
- Repository implementations belong in `core/infrastructure/repositories/` and are registered in `VisualTestInfraModule`.
- The worker process uses `IntakeWorkerModule` as its seam. Worker-specific providers must be added there, not in `IntakeApplicationModule`. This prevents lifecycle hooks (e.g., `ComparisonJobPoller.onApplicationBootstrap`) from firing in API mode.
- Internal modules should not define their own domain entities or domain services.
- Observability events (`screenshot_uploaded`, `comparison_completed`, `comparison_approved`, `baseline_updated`) live as a discriminated union in `common/domain/observability-event.type.ts`. `StateChangeWorkflow` emits them synchronously to the logger + metrics in its post-commit path — there is no event bus and no `DomainEvent` base class (see ADR-004 §3). Adding a new event means extending the union and the emit switch in `common/domain/observability-event.emitter.ts`.
- Internal modules that need to read or write domain data must do so through seams, not directly via `PrismaConnection`/`TransactionContext` or concrete public repositories. Domain query logic (e.g., "what counts as an orphaned screenshot") lives behind seams such as `STORAGE_OBJECT_REFERENCEDNESS`/`ORPHAN_SWEEP`, `PDF_RENDER_CACHE`, and `FAILED_JOB_STORE` — the `DataDeletionModule` consuming those tokens (with `VisualTestInfraModule` only providing the seam implementations) is the canonical example.
