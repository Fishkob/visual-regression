# ADR 002: Database Layer — Prisma ORM, Unit of Work, and Connection Management

## Status

Accepted — 2026-04-12 (Prisma ORM), 2026-05-23 (Unit of Work), 2026-06-20 (Connection Split, recorded)

Supersedes: ADR-002 (Prisma ORM), ADR-015 (Transactional Unit of Work), ADR-021 (Prisma Connection Split)

## Context

The database layer evolved through three stages:

1. **Prisma ORM** (April 2026) — Choosing a database access layer for PostgreSQL
2. **Transactional Unit of Work** (May 2026) — Adding atomic multi-repository write coordination
3. **Prisma Connection Split** (June 2026, implemented June 11) — Refactoring `PrismaService` into three single-responsibility classes

This ADR consolidates all three.

---

## 1. Prisma as ORM

### Decision

We use Prisma as ORM with the PostgreSQL adapter.

### Rationale

**Advantages:**

- **Type-Safety**: Fully typed queries without manual type definitions
- **Schema-as-Code**: Database schema as code in `schema.prisma`, versionable
- **Migrations**: Built-in migration engine, no external tools needed (we use `prisma migrate`; see ADR-024)
- **Dev Experience**: `prisma studio` for UI inspection, auto-generated types
- **Performance**: Batching, Prepared Statements, Connection Pooling out-of-the-box

**Disadvantages:**

- **Vendor Lock-in**: Heavily Prisma-specific features (Prisma Client, Prisma Migrate)
- **Runtime Overhead**: Slower than raw SQL at very high throughputs
- **Complex Queries**: Very complex queries can be cumbersome

**Alternatives Considered:**

- **TypeORM**: Less type-safe, more boilerplate, worse migration story
- **Knex.js**: Query builder, not ORM — more manual type work
- **Raw SQL**: No type safety, harder to refactor

### Consequences

- `schema.prisma` is the single source of truth for the data model
- Prisma Client is generated and used in code
- All models and enums are fully typed in TypeScript

---

## 2. Transactional Unit of Work

### Decision

We use `PrismaUnitOfWork` — an `@Injectable()` class that wraps `prisma.$transaction()`. Services inject `PrismaUnitOfWork` by class token (no separate port interface).

```typescript
class PrismaUnitOfWork {
  async execute<T>(
    fn: () => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
}
```

`execute` opens a transaction at the given isolation level and runs `fn` inside it. Post-commit side effects (event publishing, storage cleanup) and rollback compensation (compensating storage deletes) are **not** handled here — see the retry/callback split below.

The implementation lives in `prisma/prisma-unit-of-work.ts` and is registered in `PrismaModule`.

### Retry, post-commit and rollback live in `StateChangeWorkflow`, not the UoW

Earlier revisions of this ADR documented `executeWithRetry` and `executeWithCallbacks` on the UoW — a retried transaction with `onSuccess` after commit and `onFailure` on rollback. That surface was deliberately removed on 2026-08-05 when the retry + callback + stale-file cleanup role moved into `StateChangeWorkflow` (`public/visualTest/core/application/services/state-change-workflow.service.ts`). The workflow owns the "retry the Serializable transaction, recompute statuses in-transaction, publish events + delete stale files only after commit" convention for every mutation path (upload, diff worker, approval, threshold, deletion). The UoW today is a thin transaction opener; the workflow composes it. See [ADR-004](./004-infrastructure-patterns.md) for the event-publishing side of the same seam.

### Historical note: port removal

The original design used `IUnitOfWork` interface + `UNIT_OF_WORK` string token — matching the port pattern used by `IStorageProvider`, `IEventBus`, and `IComparisonEngine`. On 2026-06-20 this was removed for consistency with [ADR-013 (Backend Structure)](./013-backend-structure.md), which had already removed all four visual test repository ports for the same reason: one adapter, no polymorphism planned. The interface added 185 lines of boilerplate across interface, token, and module registration. Tests mock `PrismaUnitOfWork` by class token (`{ provide: PrismaUnitOfWork, useValue: mock }`), which works identically to string-token injection.

### Rationale

- **Domain isolation**: Services call `uow.execute(fn)` without knowing about Prisma transactions, isolation levels, or rollback behavior.
- **Testability**: Tests mock `PrismaUnitOfWork` by class token. No test needs a real database or a Prisma transaction mock.
- **Simplicity**: Class injection with no separate port interface aligns with the backend module architecture.

### Consequences

- Every transactional operation must call `uow.execute()`. A service that calls multiple repositories outside a `uow.execute()` block has no atomicity guarantee.
- **Retry, post-commit side effects and rollback compensation** must go through `StateChangeWorkflow.executeStateChange()` / `executeWithStoredFile()` — never re-implemented per caller. A mutation that needs a retried Serializable transaction, transactional status recompute, or post-commit event/file cleanup should not call `uow.execute()` directly.
- The `PrismaUnitOfWork` uses Prisma's interactive transaction API (`prisma.$transaction(async (tx) => ...)`). Repository methods invoked within the callback receive the transaction client via `TransactionContext` ALS routing.
- **Consumers of `PrismaUnitOfWork`**: `StateChangeWorkflow` (the single transactional mutation seam) and `OrphanCleanupService` (maintenance deletes — row-first via `deleteRecordsRowFirst`, plus the inline storage-first current-orphan path). Other application services (`UploadIntake`, `ComparisonJobProcessor`, `ApprovalService`, `TestCommandService`, `TestDeletionService`) reach transactions through `StateChangeWorkflow`, not the UoW directly.

---

## 3. PrismaService Split into Connection, Context, and Unit of Work

### Context

The original `PrismaService` was doing two distinct jobs in one class:

1. **Client lifecycle**: Connecting to Postgres, disconnecting on shutdown, exposing `$transaction()` and raw query methods.
2. **Implicit transaction routing**: Wrapping `AsyncLocalStorage<Prisma.TransactionClient>` so that repository methods called inside a transaction block automatically received the transaction client — without explicitly passing it through the call chain.

Its `client` getter silently returned either the active transaction client or the root client depending on call context. This violated the principle of least surprise — a developer reading `this.prisma.client.findMany(...)` could not tell whether the query ran inside a transaction without tracing the call stack.

Additionally, there was no way for a service to express "I only need a read-only connection" vs. "I need transaction awareness." Every consumer received the full `PrismaService`, encouraging unnecessary coupling.

### Decision

Split `PrismaService` into three classes with single responsibilities:

#### `PrismaConnection`

Lifecycle management and raw query access only. Handles `$connect`, `$disconnect`, `$transaction` (for the UoW implementation), and `$queryRaw`. Injected by consumers that need direct database access without transaction awareness.

```typescript
@Injectable()
export class PrismaConnection implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
  $queryRaw<T>(query: TemplateStringsArray | Sql): Promise<T>;
}
```

Consumers: `HealthChecker`, `TransactionContext` (as the fallback for its `client` getter), `PrismaUnitOfWork`, and the read-only repositories `TestReadRepository` and `ProjectReadRepository`. (`PostgresAdvisoryLock` is listed in `PrismaModule` but does not inject `PrismaConnection` — it builds its own single-connection `pg.Pool` because advisory locks are session-scoped.)

#### `TransactionContext`

AsyncLocalStorage wrapper that propagates the transaction client across repository calls. Its `client` getter returns the active transaction client (if inside a `run()` callback) or falls back to `PrismaConnection.client`.

```typescript
@Injectable()
export class TransactionContext {
  get client(): PrismaClient | TransactionClient;
  run<T>(tx: TransactionClient, fn: () => Promise<T>): Promise<T>;
}
```

Consumers: `PrismaUnitOfWork` (runs its callback inside `run()`), the transaction-aware repositories (`UnifiedScreenshotRepository`, `UnifiedComparisonsRepository`, `UnifiedTestRepository`, `ProjectRepository`, `VariantStore`, `OrphanedScreenshotRepository` — the latter three inject it through their shared `BaseRepository`), plus `PostgresJobQueue` and `ComparisonRetirementService` — all inject `TransactionContext` to enforce the ambient-transaction contract via `assertInTransaction()` and to route the transaction client. Read-only consumers inject `PrismaConnection` directly.

#### `PrismaUnitOfWork`

Composes `PrismaConnection` and `TransactionContext`. Opens a database transaction via `PrismaConnection.$transaction()` and runs the callback inside `TransactionContext.run()` so that repositories seamlessly participate.

```typescript
@Injectable()
export class PrismaUnitOfWork {
  async execute<T>(
    fn: () => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
}
```

Consumers: `StateChangeWorkflow` (via `executeStateChange` / `executeWithStoredFile`) and `OrphanCleanupService`. Other application services reach transactions through `StateChangeWorkflow`, not the UoW directly.

#### Registration

All three are plain `@Injectable()` classes registered in `PrismaModule`. No string tokens, no port interfaces — consistent with the backend module architecture.

```typescript
@Module({
  providers: [
    PrismaConnection,
    TransactionContext,
    PrismaUnitOfWork,
    PostgresAdvisoryLock,
  ],
  exports: [
    PrismaConnection,
    TransactionContext,
    PrismaUnitOfWork,
    PostgresAdvisoryLock,
  ],
})
export class PrismaModule {}
```

### Rationale

- **Separation of concerns**: Lifecycle, transaction routing, and transaction orchestration are distinct responsibilities. Each class has a single reason to change.
- **Explicit consumer intent**: A repository injecting `TransactionContext` says "I participate in transactions." A health check injecting `PrismaConnection` says "I just need a raw query." No more silent magic.
- **Testability**: Each class can be tested independently. `TransactionContext` wraps a five-line ALS pattern — it does not need a real database. `PrismaConnection` integration tests connect to a real Postgres without the ALS overhead.
- **Locality**: Changing transaction propagation strategy (e.g., ALS to explicit tx passing) requires editing only `TransactionContext`. The transaction-aware repositories that consume it do not change.

### Alternatives Considered

- **Keep unified PrismaService**: Simpler API surface (one import, one injection) but the magic `client` getter made query behavior unpredictable — did this query run in a transaction or not? The answer depended on call-stack context.
- **Explicit tx passing (no ALS)**: Every repository method would accept an optional `tx?: Prisma.TransactionClient` parameter. This is the most explicit approach but adds noise to every repository method signature and requires callers to thread the tx through N levels of delegation. The ALS approach keeps method signatures clean while still being correct — the `TransactionContext` is tested and scoped per async context.
- **Keep PrismaService but rename methods**: Would not address the core problem of the single class having two responsibilities.

### Consequences

- **The transaction-aware repositories** inject `TransactionContext` and access `this.txCtx.client` — this resolves to the transaction client inside a UoW block, or the root client outside one.
- **The `PrismaUnitOfWork` is the only place** that opens application-level database transactions. The single exception is `PostgresJobQueue.claimNext()` (`modules/internal/job-queue/postgres-job-queue.ts`), which opens its own `$transaction` for the `SELECT ... FOR UPDATE SKIP LOCKED` claim — it must claim atomically outside any caller's transaction and does not use the UoW at all.
- **Raw query consumers** (`PostgresAdvisoryLock`, `HealthChecker`) inject `PrismaConnection` directly — they have no use for transaction routing. (`PostgresAdvisoryLock` in fact uses its own dedicated `pg.Pool` with `max: 1` so advisory locks are held on a single connection — advisory locks are session-scoped and must not share the pool.)
- **The original `PrismaService` class** no longer exists. A quick search for `PrismaService` in the codebase returns zero results.
