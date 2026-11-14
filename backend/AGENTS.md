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
      review/                    # Inbox, approvals/votes, comments, assignments, test reads + commands
      catalog/                   # Projects, groups, branches, global search
      runs/                      # Run lifecycle, JUnit/HTML/CSV reports, trends
      access/                    # Share links, PDF render/download, storage-retention settings
      notifications/             # Webhook endpoint administration (delivery lives in internal/webhooks)
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
- `AllExceptionsFilter` catches DomainError → maps code to HTTP status, Prisma `P2002`→409, `P2025`→404, einen 4xx, den eine Middleware an ihren Fehler gehängt hat (z. B. body-parser `413` bei zu großem Body) → dieser Status, unknown→500
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
- **Repository-Specs prüfen Query-Policy, nicht Query-Mechanik.** Was die Query sichtbar macht (Filter, Reihenfolge, Limit, gewählte Spalten) gehört in den Unit-Test — mit `expect.objectContaining(...)` auf den Policy-Feldern, nicht als volles `toEqual` auf das Argument. Was sie garantiert (`FOR UPDATE`, `SKIP LOCKED`, Isolation) gehört in einen Race-Case in `test/e2e/`; ein String-Test darauf bleibt grün für genau die Fehler, die er finden soll. Die Regel steht in ADR-059, ein Verstoß scheitert an `local/no-locking-clause-assertions`.
- **Datenbank-Garantien gehören an die echte Postgres-Instanz.** Sperrverhalten (`FOR UPDATE SKIP LOCKED`), Unique-Indizes, Isolation und Retries lassen sich weder durch HTTP (zwei gleichzeitige Anfragen sind so nicht erzeugbar) noch durch einen Stub beweisen: dafür darf ein Spec in `test/e2e/` einen Service oder die Queue aus der laufenden App heraus treiben. Ein Konkurrenztest muss fehlschlagen, wenn man den Mechanismus entfernt — sonst beweist er nichts.
- **Bootstrap-Wiring wird von `test/e2e/health/boot-smoke.e2e-spec.ts` geprüft.** `TestApp` stellt Global Prefix und Validation Pipe nach und lässt den Rest von `bootstrapApi` aus (trust proxy, Body-Limits, helmet, CORS, Swagger-Gate, `listen`). Eine Änderung an dieser Verdrahtung gehört in den Smoke-Test, nicht in einen Unit-Test, der den Bootstrap nachbaut. `src/bootstrap.ts` ist deshalb aus dem Unit-Gate ausgenommen.
- **Coverage-Gate:** `pnpm run unitTest:cov` erzwingt Schwellen pro Schicht (`vitest.config.ts`); `**/presentation/**` ist bewusst ausgenommen, weil die HTTP-Suite die Controller besitzt. Zahlen werden nach dem Schließen einer Lücke angehoben, nie gesenkt. Das zusammengeführte Bild beider Suiten liefert `pnpm run coverage:all` — als Lückenprüfung, nicht als Prozent-Gate: die Frage ist, ob eine Datei von keiner Suite geladen oder von einer geladen und nie ausgeführt wird. E2E-Prozente beziehen sich auf einen anderen Nenner als die Schwellen.

## Prisma

- Schema: `prisma/schema.prisma` — unified model (UnifiedTest, UnifiedVariant, UnifiedScreenshot, UnifiedComparison)
- Management: `prisma migrate` — dev: `db:migrate` (`migrate dev`), CI/prod: `migrate deploy`. See ADR-024.
- Enums: `TestKind` (image/pdf), `ScreenshotType` (BASELINE/CURRENT), `ComparisonStatus` (PENDING_APPROVAL/APPROVED), `TestStatus` (PENDING/UNCHANGED/PENDING_APPROVAL)
- Client re-exported from `src/prisma/client.ts`
- Repositories extend `BaseRepository`, use `PrismaUnitOfWork.execute()`
- **ORM first.** A query is written with the Prisma client (`findMany`/`count`/`aggregate`/`groupBy`,
  relation filters) unless Prisma cannot express it — recursive branch chains, `FILTER` aggregates
  over several tables, `= ANY(array)` guards, `ON CONFLICT`/`RETURNING` primitives. A raw query then
  lives in the repository that owns the rule, as a `Prisma.sql` fragment with its parameters bound —
  never a hand-built string. Do not reach for raw SQL to save a round-trip: parallelise the ORM calls
  (`Promise.all`) or batch them first.

## State-Change Conventions

- `UnifiedTest.status` is a persisted aggregate recomputed transactionally via `TestStatusService.recomputeStatus(testId)`. The recompute is compile-enforced: a `StateChangeWorkflow.executeStateChange()` / `executeWithStoredFile()` change returns a `PersistedChange` — either `{ kind: 'change', affectedTestIds: [testId, ...] }` (non-empty tuple, so "forgot the testId" does not compile) for a mutation that changed domain rows, `{ kind: 'noop' }` for one that changed nothing, or `{ kind: 'deleted' }` for a whole-test deletion (the affected tests no longer exist to name). A `noop`/`deleted` cannot publish events. The workflow recomputes statuses for `change` results in the SAME transaction as the change (upload, diff worker, approval, threshold, variant deletion). There is deliberately no event-triggered or post-commit recompute; the status update is atomic with the change. See CONTEXT.md "Test status recompute is a transactional calling convention".
- Retirement of superseded comparisons (the "at most one reviewable comparison per Variant" invariant) is owned by `ComparisonRetirementService` — do not re-orchestrate comparison deletion + candidate cleanup + job cancellation in a new call site. Candidate rows are reclaimed through the single owner `UnifiedScreenshotRepository.deleteCandidatesAndCollectUrls` (which guards against deleting a candidate still referenced by a comparison). Single-candidate reclamation (a moot worker job, an unchanged diff) flows through `CandidateReclamationService.reclaimCandidateInChange({ testId, candidateId | resolveCandidate, expectedUrl?, events? })`, which owns the `StateChangeWorkflow` transaction itself (the caller stops hand-rolling `executeStateChange`) and delegates to the guarded owner (`deleteCandidateIfCurrent` when `expectedUrl` guards the delete, or `resolveCandidate` re-reads the row in-transaction). `ComparisonRetirementService` is the transaction-riding half — call its recipes only from inside a workflow change; `CandidateReclamationService` owns its own transaction.
