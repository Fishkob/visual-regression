# ADR 004: Infrastructure Patterns — Storage, Queue, and Event Bus

## Status

Accepted — 2026-04-12 (Storage), 2026-05-14 (Queue), 2026-05-23 (Event Bus)

Supersedes: ADR-004 (Storage Abstraction), ADR-006 (Postgres Queue), ADR-014 (In-Process Event Bus)

## Context

Three cross-cutting infrastructure decisions were made as the platform evolved:

1. **Object storage** (April 2026) — Screenshots and diff images need S3-compatible persistence
2. **Job queue** (May 2026) — Replaced Redis/BullMQ with Postgres-backed queue for async comparisons
3. **Event bus** (May 2026) — In-process event bus for domain events within a single process

This ADR consolidates all three.

---

## 1. S3-Compatible Storage Abstraction

### Decision

We use an S3-compatible object store as the storage backend — RustFS locally, AWS S3 (or another S3-compatible provider) in production — behind an abstraction layer (`IStorageProvider` interface).

### Rationale

**Advantages:**

- **S3 Compatibility**: Local development with RustFS, production can use AWS S3, GCS, Azure Blob
- **Abstraction**: Interface enables swapping the storage backend without code changes
- **Local Dev**: RustFS can be started via Docker Compose, no cloud account needed
- **Standard**: S3 is an industry standard — easy integration with CI/CD, CDNs, etc.

**Disadvantages:**

- **Complexity**: Extra infrastructure (RustFS container)
- **Feature Gaps**: The local S3-compatible server doesn't have all S3 features (e.g., certain lifecycle rules)

**Alternatives Considered:**

- **Local Filesystem**: No scalability, not suitable for production
- **Database BLOB**: Not recommended for large files, poor performance
- **Cloud-Only (S3)**: Impossible for local development without credentials

### Consequences

- `IStorageProvider` interface defines `putObject`, `get`, `deleteQuietly`, `deletePrefix`, `deleteAll`, `listObjectsWithLastModified`, `exists`, `healthCheck`, `toPublicUrl`, `fromUrl`. `putObject` is the single write method — it carries screenshots (image/PDF), diff artifacts, rendered page images, and the pdf-sidecar page-count blobs (renamed from `uploadImage` on 2026-08-09 because it stores non-image payloads too). URL round-tripping is exposed directly on the seam (`toPublicUrl`/`fromUrl`) and backed by the separately-injected `StorageObjectName` helper, so consumers never import the concrete helper. `deletePrefix` returns the number of objects actually reclaimed. `listObjectsWithLastModified` serves the maintenance sweeps: `PdfRenderCacheCleanupTask` (the `pdf-render/` namespace, which is not tracked in the DB) and `UnreferencedObjectCleanupTask`, which needs object age to apply the unreferenced-object floor.
- RustFS implements the interface for local development (`RustFsStorageService`, using the `minio` client library against the RustFS S3-compatible server; renamed from `MinioStorageService` when the local MinIO container was replaced by RustFS)
- Switching to another S3-compatible provider (e.g., AWS S3, GCS) is possible by swapping the provider only
- All file operations go through the Storage Interface
- The abstraction was questioned during an architecture review (hypothetical seam with only one adapter). However, the seam is real — the local backend already moved from MinIO to RustFS by swapping the provider, and a future migration to AWS S3/GCS stays possible. The interface remains in place.

---

## 2. Postgres-based Queue Processing

### Context

Previously, BullMQ with Redis was used as the queue backend for async comparison processing. Redis as an additional infrastructure component increased complexity (separate Docker service, health checks, two connections per process, configuration across 5 env files + 3 Docker Compose files) while handling a low workload (one queue, one job type, one processor).

### Decision

Replace Redis/BullMQ with a Postgres-based queue. Postgres is already in the stack and provides a robust foundation for an async job queue with `SELECT ... FOR UPDATE SKIP LOCKED` and a stall-reclaim heartbeat.

### Rationale

**Advantages:**

- **No additional infrastructure**: Postgres is already present
- **Transactional consistency**: Jobs live in the same database as application data
- **Simpler configuration**: ~15 Redis-related files eliminated
- **Reliability**: adaptive polling (2–30s backoff) with claim-based processing, retry with exponential backoff, job persistence, dead-letter after N attempts, and a heartbeat that re-queues jobs whose worker crashed

**Disadvantages:**

- **Polling latency**: New work can wait up to the adaptive poll interval (2–30s backoff) between polls
- **Additional DB load**: Polling query on every queue check
- **Custom implementation**: Lacks BullMQ's feature richness (priorities, delayed jobs, etc.)

**Abandoned BullMQ Features (currently not needed):**

- **Horizontal scaling**: Single worker sufficient
- **Priorities**: Not needed with one job type
- **Scheduled/Delayed jobs**: Not needed

### Consequences

- `PostgresJobQueue` implements two role-separated faces (`common/domain/job-queue.interface.ts`): the producer face (`IJobProducer`, `JOB_PRODUCER` token — `enqueue`/`cancel*`) for upload, retirement, and deletion paths, and the worker/ops face (`IJobQueue`, `JOB_QUEUE` token — `processNext`/`healthCheck`) for the poller and health checker. This keeps producer callers from ever seeing worker mechanics (claiming, heartbeats, completion), which stay private to the implementation. One adapter (`PostgresJobQueue`) backs both tokens — the seam stays because the queue's claim/stall/retry internals are deliberately hidden behind it from public modules. See ADR-013 for the class-token injection convention and its one-adapter rule.
- `ComparisonProcessor` becomes `ComparisonJobProcessor` (same logic, no BullMQ dependency)
- New `ComparisonJobPoller` in worker for adaptive polling
- Redis modules, health checks, and config are removed
- BullMQ, `@nestjs/bullmq`, `redis`, `@types/redis` removed from dependencies
- Docker Compose loses Redis service
- Env files lose REDIS\_\*-variables

---

## 3. Observability Emission (formerly: In-Process Event Bus)

### Context

Domain events were published by application services (e.g., `ScreenshotUploadedEvent`, `ComparisonApprovedEvent`) and handled by subscribers (e.g., `LoggingEventHandler`, `MetricsAggregatorEventHandler`). The event bus abstraction was always present but the runtime choice — in-process vs. external message broker — was never recorded.

### Decision (2026-08-05 through 2026-08-09)

We originally chose an in-process event bus backed by `@nestjs/event-emitter` (EventEmitter2), implemented by the concrete `EventEmitterEventBus` class, registered in the `@Global()` `EventBusModule`. On 2026-08-05 the `IEventBus` interface and `EVENT_BUS` token were removed (one consumer, one adapter — a hypothetical seam). On 2026-08-07 the transactional outbox was removed.

**On 2026-08-09 the event bus itself was removed.** The only subscribers were observability (logging + metrics), both running inside the same process and both consuming the `AppLoggerService` and `IMetricsRecorder` that `StateChangeWorkflow` already had injected. `StateChangeWorkflow` now emits observability directly: state-change mutations return a discriminated-union `ObservabilityEvent[]` in the `PersistedChange` contract (`common/domain/observability-event.type.ts`), and the workflow switches on `event.kind` to call `logger.log(...)` / `metrics.incrementCounter(...)` / `observeHistogram(...)` synchronously in its post-commit path. The `@nestjs/event-emitter` dependency, `EventEmitterEventBus`, `EventBusModule`, the `DomainEvent` base class, the four event classes, and both `@OnEvent` handlers were deleted.

### Rationale

- **Simplicity**: The events carried 2-5 fields to exactly two subscribers, both observability, both in-process. The bus added a global module, an emitter dependency, subscriber-registration ceremony, and per-subscriber failure isolation for no decoupling value — there were zero business subscribers.
- **Locality**: The post-commit observability switch lives beside the transaction orchestration that produces the events, so the "what happened" → "log/metric it" mapping is visible in one place.
- **Seam for the future**: If a durable subscriber (e.g. a webhook relay) ever needs crash-survival of events, re-add an outbox + publisher at the `StateChangeWorkflow` post-commit path — the `PersistedChange.events` channel still exists as the place where mutations declare their outcome. The only change is replacing the synchronous observability switch with a publish.

### Consequences

- `StateChangeWorkflow` emits observability synchronously after commit, inside the same failure-isolated post-commit span that runs `onSuccess` and stale-file deletion. A throwing logger/metrics call is caught, metered (`post_commit_callback_failures_total`), and never propagates.
- The `domain_events_total` counter (labels `event`, `type`, `status`) is registered by the workflow constructor.
- Cross-process events (e.g., webhook notifications, pushing to a CDN) would currently not survive a process crash — they are not durable. This is acceptable at current scale.
