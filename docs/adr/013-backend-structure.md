# ADR 013: Backend Structure — Module Architecture and Worker/API Separation

## Status

Accepted — 2026-05-23 (all original decisions).

## History

This file absorbed five earlier ADRs on 2026-10-27: ADR-007 (VisualTest module
split), ADR-008 (repository ports), ADR-012 (public/internal boundary), the
earlier ADR-013 (worker/API separation) and ADR-017 (their consolidation, now a
stub pointing here). Two design changes had been recorded in place before the
freeze: `shared/` became `core/` and the repository ports were dropped in favour
of class injection (2026-06-13), and `review/` was split along the nouns
`CONTEXT.md` already uses (2026-10-27, see §2).

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

- **`modules/internal/*`** — Infrastructure modules that provide capabilities consumed by public modules (e.g., `storage`, `comparison-engine`, `metrics`, `health`, `data-deletion`). These are thin — typically a single service behind a port from `common/domain/`. They own no visual test domain concepts (Project, VisualTest, Screenshot, Comparison) and have no visual test domain layer; the models some of them do own — `User`, `Session`, `ApiKey` in `auth`/`users`, `AuditEvent` in `audit` — are their own persistence-adjacent ones. Internal modules can be swapped out without affecting the domain model.

- **`common/`** — Shared cross-cutting concerns that both public and internal modules depend on: domain interfaces (`IStorageProvider`, `IComparisonEngine`; `IEventBus` was removed on 2026-08-05 — see [ADR-004](./004-infrastructure-patterns.md)), base types (`DomainError`, `VariantRecord`, `UploadOutcome`), the observability-event type, infrastructure (`tracker`, `logging`, `http`).

Internal modules must not import public domain entities or application services — the dependency arrow always points internal → public, and it crosses only at the seam.

**Exception:** Internal modules may import `VisualTestInfraModule` to consume the seam tokens it provides (e.g. `STORAGE_OBJECT_REFERENCEDNESS`, `ORPHAN_SWEEP`, or shared repository classes). This is how the maintenance tasks work today: `run-auto-finish`, `run-history-cleanup`, and `storage-size-backfill` import `RunRepository`, `ProjectRepository`, `UnifiedScreenshotRepository`, and `UnifiedComparisonsRepository` by class token. Internal modules must not import domain entities, application services, or other public module types — only the seam/repository classes and their provider tokens.

---

## 2. VisualTest Module Split

### Decision

The `visualTest` module at `modules/public/visualTest/` was split into seven sub-modules:

- **`intake/`** — Upload, screenshot creation, queuing, job polling, comparison execution
- **`review/`** — The review loop: Inbox, approving/skipping, votes and decision reasons, comments, assignments, per-test reads and test/variant commands
- **`catalog/`** — What exists and where it lives: Project, Group, Branch, and the global test search
- **`runs/`** — A CI run's lifecycle and gate, its JUnit/HTML/CSV reports, and the trend window
- **`access/`** — How evidence is reached from outside a review session: expiring share links, the PDF render/download proxies, storage quota and retention settings
- **`notifications/`** — Webhook endpoint administration; delivery itself is `internal/webhooks` (the worker dispatches)
- **`core/`** — Cross-cutting entities, policies, base classes, types, repository implementations. Originally named `shared/`; renamed on 2026-06-11 to communicate purpose over usage.

The five review-family modules (`review/`, `catalog/`, `runs/`, `access/`, `notifications/`) follow one rule: a module owns the nouns in its name, and a cross-family dependency is an explicit module import with an exported provider (a Run's approve-all imports `ReviewModule` for `ApprovalService`; access reads tests through `ReviewModule`'s `TestQueryService`; review and access both read projects through `CatalogModule`). Moving a controller between families is therefore a module-declaration change, not just a file move.

Consolidations applied during the split:

| Before                                  | After                                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6 use cases (single-method classes)     | Methods on the relevant application service                                                                                                                                                                                                |
| `VisualTestFacade`                      | Removed — services are injected directly                                                                                                                                                                                                   |
| 3 finder repositories                   | Folded into `UnifiedComparisonsRepository` and `UnifiedTestRepository`                                                                                                                                                                     |
| 3 mapper layers (Prisma → Entity → DTO) | 3 mappers in `core/infrastructure/mappers/` + one per API family (`review/`, `catalog/`, `access/` `infrastructure/mappers/`) (Prisma → Entity: comparison + screenshot; Entity → DTO: comparison-dto, project-response, pdf-test-details) |
| Flat NestJS module                      | No wrapper module — `AppModule` imports sub-modules directly (`VisualTestApplicationModule`, `IntakeApplicationModule`, `ReviewModule`)                                                                                                    |

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

The repository implementations live in `core/infrastructure/repositories/` and are registered in `VisualTestInfraModule`; the read-only ones sit in their family's `infrastructure/repositories/`. Cross-cutting application services (`TestResolver`, `TestDeletionService`) live in `core/application/services/` and are registered in `VisualTestApplicationModule`. There is no repository facade and no inventory kept here — the directories are the list, and consumers inject the concrete classes they need.

The `core/domain/ports/` directory was deleted on 2026-06-13 — all four repository ports had exactly one adapter each and the interface maintenance cost (185 lines of boilerplate, dual-file edits per method change) exceeded the documentation benefit. Tests provide mock objects under the class token (`{ provide: ComparisonsRepository, useValue: mock }`), which works identically to string-token injection.

#### Why not `@Global()` for domain modules

`VisualTestInfraModule` is not `@Global()` — all dependencies are explicit. Originally `SharedModule` (now `core/`) was `@Global()` to paper over a circular import. Moving all repository implementations into `core/infrastructure/repositories/` broke the cycle cleanly. The `@Global()` pattern was fragile: removing it would silently break injection in any consumer.

Domain modules must never be `@Global()`. Every domain dependency must be declared in `imports`.

#### Approved `@Global()` modules

The following infrastructure modules are `@Global()` because they are genuinely cross-cutting — removing `@Global()` would require every single module in the application to declare an explicit import for a non-domain concern: **`AppLoggerModule`**, **`LoggerConfigModule`**, **`TrackerModule`**, **`MetricsBaseModule`**.

This is a closed set. A fifth `@Global()` module is its own decision, not an edit to this sentence; if the set ever approaches eight, the implicit dependency graph is undermining the architecture's self-documenting property and the exceptions need re-arguing. The file paths and consumer counts are deliberately not repeated here — the modules and their imports are in `common/` and `internal/`.

---

## 4. Dependency Graph

`AppModule` (API mode) imports the public domain modules, the internal capability
modules, and `CoreInfrastructureModule`; `WorkerModule` imports
`CoreInfrastructureModule` and `IntakeWorkerModule` and nothing else. Sub-modules
are imported directly — there is no composing wrapper module, and no
`forwardRef()` is needed because the graph is acyclic.

The rules that keep it acyclic: a cross-family dependency is an explicit module
import with an exported provider (§2), never a shared global; a controller is
mounted by the module that owns its noun; worker-only providers live in
`IntakeWorkerModule`, so their lifecycle hooks never fire in API mode (§5); and
the maintenance crons are mounted only in the API process (`ScheduleModule.forRoot()`
in `AppModule`), so the worker graph contains no cron jobs.

The import lists themselves are the module files (`app.module.ts`,
`worker.module.ts`, and each feature module's `*.module.ts`); the picture is in
[the architecture overview](../architecture/overview.md#module-graph).

---

## 5. Worker/API Process Separation

### Context

The backend has a single entry point, `main.ts`: it reads `NODE_MODE` and dispatches — `api` boots `AppModule` (NestJS HTTP app with controllers) via `NestFactory.create`, `worker` boots `WorkerModule` (`worker.module.ts` — no controllers, only queue polling and background job processing) via `NestFactory.createApplicationContext`. The worker process imports `IntakeWorkerModule` (for `ComparisonJobPoller` and `ComparisonJobProcessor`) instead of `IntakeApplicationModule` — keeping `UploadController`/`JobStatusController` and their `MulterModule` upload pipelines out of worker mode.

### Decision

The API and worker run as separate processes sharing the same codebase, database, and storage:

- **`AppModule`** (`main.ts`) — HTTP API server. Imports the public domain modules, the internal capability modules, `CoreInfrastructureModule`, and `RateLimitModule`; the list itself is in `app.module.ts`.
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
- There is one `nest-cli.json` and one build: both processes come out of the same `dist/src/main.js` and are selected at runtime by `NODE_MODE` (`docker-compose.yml` sets `NODE_MODE: worker` for the worker service; `backend/Dockerfile` and `backend/Dockerfile.worker` differ only in the health-server port).

---

## Rationale (overall)

- **Separation of concerns**: Public modules model the domain; internal modules provide machinery. A developer working on "comparison approval" does not need to understand RustFS.
- **Locality**: Tracing "what happens on approval" visits 2–3 files instead of 5+.
- **Leverage**: Fewer interfaces with the same behavior. Consolidating 6 use case classes into service methods removed boilerplate without losing clarity.
- **Testability**: Tests exercise service methods directly rather than orchestrating mocked facades. Repository class tokens let tests substitute mocks without coupling to constructor details.
- **Replaceability**: Swapping RustFS for AWS S3, or pixelmatch for a cloud vision API, requires changing only the internal module — the domain is insulated.
- **Consistency**: Class-token injection is the default for repositories and application services; a port interface plus string token is reserved for the seams that genuinely need exchangeability — storage (`STORAGE_PROVIDER`), the comparison engines (`COMPARISON_ENGINES`, `PDF_COMPARISON_ENGINE`), and the job queue (`JOB_PRODUCER`, `JOB_QUEUE`, `FAILED_JOB_STORE`). There is no event-bus port and no unit-of-work port (see ADR-002, ADR-004).
- **Explicit dependencies**: The `@Global()` exception is limited to genuinely cross-cutting infrastructure. Domain modules always declare their imports explicitly — the architecture is self-documenting.

## Consequences (overall)

- New domain modules belong in `modules/public/`, new infrastructure modules in `modules/internal/`.
- Adding a repository method requires updating only the implementation — no separate interface to maintain.
- Repository contracts are documented by the class's public methods rather than a separate interface file.
- Cross-cutting application services belong in `core/application/services/` and are registered in `VisualTestApplicationModule`.
- Repository implementations belong in `core/infrastructure/repositories/` and are registered in `VisualTestInfraModule`.
- The worker process uses `IntakeWorkerModule` as its seam. Worker-specific providers must be added there, not in `IntakeApplicationModule`. This prevents lifecycle hooks (e.g., `ComparisonJobPoller.onApplicationBootstrap`) from firing in API mode.
- Internal modules must not define visual test domain entities or domain services; the persistence-adjacent models they do own (`User`, `Session`, `ApiKey`, `AuditEvent`) stay inside them.
- Observability events (`screenshot_uploaded`, `comparison_completed`, `comparison_approved`, `baseline_updated`) live as a discriminated union in `common/domain/observability-event.type.ts`. `StateChangeWorkflow` emits them synchronously to the logger + metrics in its post-commit path — there is no event bus and no `DomainEvent` base class (see ADR-004 §3). Adding a new event means extending the union and the emit switch in `common/domain/observability-event.emitter.ts`.
- Internal modules reach visual test data either through a seam token (`STORAGE_OBJECT_REFERENCEDNESS`/`ORPHAN_SWEEP`, `PDF_RENDER_CACHE`, `FAILED_JOB_STORE`) or through a public repository class imported from `VisualTestInfraModule`; the maintenance sweeps that are deliberately not transaction-ambient run on the bare `PrismaConnection`. Domain query logic (e.g. "what counts as an orphaned screenshot") stays behind the seams.
