# AGENTS.md — Backend (NestJS + Prisma)

## Module Structure

```
src/
  app.module.ts                  # Root module (API mode)
  worker.module.ts               # Standalone worker mode
  swagger-app.module.ts          # Swagger doc export only
  config/                        # NestJS config + env validation (Joi)
  prisma/                        # PrismaModule, PrismaConnection, PrismaUnitOfWork, BaseRepository, client re-exports
    common/
      domain/                      # Interfaces + DI tokens + observability-event type
      dto/                         # Shared DTOs (error-response, pagination, paginated-response)
      http/                        # AllExceptionsFilter, LoggingInterceptor, pipes
      infrastructure/              # Implementations (retry-policy)
      logging/                     # AppLoggerService
      tracker/                     # Operation tracker (metrics + logs)
      utils/                       # assertNever, is-string, exception-status, paginated-query, with-timeout
  modules/
    internal/                    # comparison-engine, data-deletion, storage, job-queue, health, dlq, metrics, logging
    public/visualTest/
      core/                      # Domain entities, policies, repositories, application services
      intake/                    # Upload controllers, pipelines, workers
      review/                    # Approval controllers, DTOs, mappers, application services
```

## DI & Module Patterns

- Interfaces + injection tokens defined in `common/domain/` as `export const TOKEN = 'TOKEN'`
- Multi-provider arrays for strategy pattern: `COMPARISON_ENGINES`, `MAINTENANCE_TASKS`
- `CoreInfrastructureModule` is the composite module imported by most feature modules
- `VisualTestApplicationModule` and `VisualTestInfraModule` are imported independently by consumers (no composing wrapper)

## File Naming

| Type         | Pattern                    | Example                         |
| ------------ | -------------------------- | ------------------------------- |
| Source       | `kebab-case.ts`            | `test-command.service.ts`       |
| Module       | `kebab-case.module.ts`     | `visual-test.module.ts`         |
| Controller   | `kebab-case.controller.ts` | `tests.controller.ts`           |
| Service      | `kebab-case.service.ts`    | `rustfs-storage.service.ts`     |
| Entity       | `kebab-case.entity.ts`     | `comparison.entity.ts`          |
| Value object | `kebab-case.vo.ts`         | `variant.vo.ts`                 |
| DTO          | `kebab-case.dto.ts`        | `upload.dto.ts`                 |
| Interface    | `kebab-case.interface.ts`  | `storage-provider.interface.ts` |
| Event        | `kebab-case.event.ts`      | `comparison-completed.event.ts` |
| Policy       | `kebab-case.policy.ts`     | `threshold-policy.ts`           |
| Type         | `kebab-case.types.ts`      | `visual-test.types.ts`          |
| Spec         | `kebab-case.spec.ts`       | `test-command.service.spec.ts`  |
| E2E spec     | `kebab-case.e2e-spec.ts`   | `comparisons.e2e-spec.ts`       |

## Path Aliases

`@common/*` → `src/common/*`, `@public/*` → `src/modules/public/*`, `@internal/*` → `src/modules/internal/*`, `@config/*` → `src/config/*`, `@prisma/*` → `src/prisma/*`, `@/*` → `src/*`, `@test/*` → `test/*`

## Error Handling

- Domain errors via `DomainError` with `code` property (`NOT_FOUND`, `CONFLICT`, `BAD_REQUEST`, `INVALID_STATE`, `INTERNAL_ERROR`)
- `AllExceptionsFilter` catches DomainError → maps code to HTTP status, Prisma `P2002`→409, `P2025`→404, unknown→500
- Response includes `{ statusCode, message, timestamp, path, traceId }`

## Testing

- Runner ist Vitest (`globals: true`). Mock-/Spy-API ist `vi.*` als global verfügbar — z.B. `vi.fn()`, `vi.spyOn()`, `vi.restoreAllMocks()`. Mock-Typen als Import aus `vitest` (`import type { Mock, Mocked } from 'vitest'`).
- Ablage: Specs in `test/unit/` spiegeln `src/`; Basisname = Quellname + `.spec.ts`.
- DI-basierte Units (Services/Controller/Repositories): Dependencies als `Mocked<X>` deklarieren; in `beforeEach` via `createMock<X>()` (`@test/utils/create-mock`) erzeugen und per `Test.createTestingModule({ providers: [{ provide: X, useValue: mock }] }).compile()` verdrahten; Unit via `module.get(X)`.
- Reine Funktionen (Pipes/Policies/Mapper/VOs): kein NestJS-Modul — direkt instanziieren, plain `expect(...)`.
- Fixtures: lokale Factorys in der Spec (`function makeScreenshot(overrides = {})`), keine Shared Entity-Builder. Geteilt sind nur `createMock`, `createMockLogger`, `createMockFile`, `createMockStorage`, `createMockUoW` (`test/utils/mocks.ts`).
- `afterEach`: in jeder Spec `afterEach(() => { vi.restoreAllMocks(); })`.
- Naming: einklassige Dateien → `describe('ClassName')`; Multi-Funktions-Module → `describe('fileName')` mit innerem `describe('functionName')`. `it()`-Beschreibungen verhaltensorientiert, dritte Person, ohne "should": `it('rejects an unknown kind')`.
- Assertions: Aufrufe → `toHaveBeenCalledWith(...)`, Ergebnisse → `toEqual(...)`, Fehler → `rejects.toMatchObject({ code: … })` / `rejects.toThrow(...)`.

## Prisma

- Schema: `prisma/schema.prisma` — unified model (UnifiedTest, UnifiedVariant, UnifiedScreenshot, UnifiedComparison)
- Management: `prisma migrate` — dev: `db:migrate` (`migrate dev`), CI/prod: `migrate deploy`. See ADR-024.
- Enums: `TestKind` (image/pdf), `ScreenshotType` (BASELINE/CURRENT), `ComparisonStatus` (UNCHANGED/PENDING_APPROVAL/APPROVED), `TestStatus` (PENDING/UNCHANGED/PENDING_APPROVAL)
- Client re-exported from `src/prisma/client.ts`
- Repositories extend `BaseRepository`, use `PrismaUnitOfWork.execute()`

## State-Change Conventions

- `UnifiedTest.status` is a persisted aggregate recomputed transactionally via `TestStatusService.recomputeStatus(testId)`. The recompute is compile-enforced: a `StateChangeWorkflow.executeStateChange()` / `executeWithStoredFile()` change returns a `PersistedChange` — either `{ kind: 'change', affectedTestIds: [testId, ...] }` (non-empty tuple, so "forgot the testId" does not compile) for a mutation that changed domain rows, `{ kind: 'noop' }` for one that changed nothing, or `{ kind: 'deleted' }` for a whole-test deletion (the affected tests no longer exist to name). A `noop`/`deleted` cannot publish events. The workflow recomputes statuses for `change` results in the SAME transaction as the change (upload, diff worker, approval, threshold, variant deletion). There is deliberately no event-triggered or post-commit recompute; the status update is atomic with the change. See CONTEXT.md "Test status recompute is a transactional calling convention".
- Retirement of superseded comparisons (the "at most one reviewable comparison per Variant" invariant) is owned by `ComparisonRetirementService` — do not re-orchestrate comparison deletion + candidate cleanup + job cancellation in a new call site. Candidate rows are reclaimed through the single owner `UnifiedScreenshotRepository.deleteCandidatesAndCollectUrls` (which guards against deleting a candidate still referenced by a comparison). Single-candidate reclamation (a moot worker job, an unchanged diff) flows through `CandidateReclamationService.reclaimCandidateInChange({ testId, candidateId | resolveCandidate, expectedUrl?, events? })`, which owns the `StateChangeWorkflow` transaction itself (the caller stops hand-rolling `executeStateChange`) and delegates to the guarded owner (`deleteCandidateIfCurrent` when `expectedUrl` guards the delete, or `resolveCandidate` re-reads the row in-transaction). `ComparisonRetirementService` is the transaction-riding half — call its recipes only from inside a workflow change; `CandidateReclamationService` owns its own transaction.
