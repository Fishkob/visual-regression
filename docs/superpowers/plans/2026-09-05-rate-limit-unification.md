# Rate-Limit Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two coexisting rate-limit mechanisms (`@nestjs/throttler` per-IP in-memory throttles + a custom Postgres upload bucket) with one uniform mechanism — a fixed one-minute-window counter row in Postgres per (scope, key) — applied to exactly three endpoints: `upload` (per API key), `login` (per IP), `log` ingestion (per IP).

**Architecture:** A generic `RateLimitBucket` Postgres table replaces `ApiKeyRateLimitBucket`. A new `RateLimitService` performs the atomic upsert; a new global `RateLimitGuard` (registered _after_ `AuthenticationGuard`) reads a `@RateLimit(scope)` decorator and is a pass-through on every other route. `@nestjs/throttler`, the global flood guard, the TTL knobs, and the `skipIf` machinery are deleted. Env surface collapses to `UPLOAD_RATE_LIMIT_PER_MINUTE`, `LOGIN_RATE_LIMIT_PER_MINUTE`, `LOG_RATE_LIMIT_PER_MINUTE` plus `TRUST_PROXY` (now affecting only the two IP-keyed rules).

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL), Vitest. See `docs/superpowers/specs/2026-09-05-rate-limit-unification-design.md`.

---

## Commands reference (used throughout)

All shell commands run from the repo root unless a `workdir` is given.

- Backend unit tests: `pnpm --filter ./backend test -- test/unit`
- Backend typecheck: `pnpm --filter ./backend typecheck && pnpm --filter ./backend typecheck:test`
- Backend lint: `pnpm --filter ./backend lint:check`
- Prettier (format before every commit): `pnpm prettier --write <paths...>`
- Prisma client regen: `pnpm --filter ./backend prisma:generate`
- New migration (needs Postgres up — start it with `./scripts/dev.sh infra`):
  `POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres POSTGRES_DB=vrt DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vrt pnpm --filter ./backend exec prisma migrate dev --name rate_limit_bucket_unification`
- Backend e2e: `pnpm run e2eTest` (auto-starts Docker infra)

Pre-commit hooks run lint/typecheck/tests on staged files and auto-regenerate the SDK when `backend/src/**` changed — never use `--no-verify`; check hook output after each commit.

---

## File map

New files (all under `backend/`):

- `src/modules/internal/rate-limit/rate-limit-window.ts` — fixed-window helpers (moved from intake)
- `src/modules/internal/rate-limit/rate-limit.service.ts` — atomic upsert on `RateLimitBucket`
- `src/modules/internal/rate-limit/rate-limit.decorator.ts` — `@RateLimit(scope)` + metadata key + `RateLimitScope` type
- `src/modules/internal/rate-limit/rate-limit.guard.ts` — global guard
- `src/modules/internal/rate-limit/rate-limit.module.ts` — exports `RateLimitService`
- `test/unit/modules/internal/rate-limit/rate-limit-window.spec.ts`
- `test/unit/modules/internal/rate-limit/rate-limit.service.spec.ts`
- `test/unit/modules/internal/rate-limit/rate-limit.guard.spec.ts`
- `test/e2e/rate-limit-login.e2e-spec.ts`

Deleted files:

- `src/modules/public/visualTest/intake/presentation/guards/upload-rate-limit.guard.ts` (+ its spec)
- `src/modules/public/visualTest/intake/application/upload-rate-limit.service.ts` (+ its spec)
- `src/modules/public/visualTest/intake/application/upload-rate-limit-window.ts` (+ its spec)
- `src/config/throttle-config.module.ts` (+ its spec)
- `src/config/throttle-limits.ts`
- `src/modules/internal/data-deletion/tasks/upload-rate-limit-bucket-cleanup.task.ts` (renamed)

Modified files (backend src): `prisma/schema.prisma`, `src/app.module.ts`, `src/main.ts`, `src/config/env.validation.ts`, `src/config/app-config.service.ts`, `src/common/domain/metrics-catalog.ts`, `src/modules/internal/auth/auth.controller.ts`, `src/modules/internal/logging/log-ingestion.controller.ts`, `src/modules/internal/health/health.controller.ts`, `src/modules/internal/metrics/metrics.controller.ts`, `src/modules/internal/data-deletion/maintenance-lock-ids.ts`, `src/modules/internal/data-deletion/data-deletion.module.ts`, `src/modules/internal/data-deletion/tasks/rate-limit-bucket-cleanup.task.ts`, `src/modules/public/visualTest/intake/intake-application.module.ts`, `src/modules/public/visualTest/intake/presentation/controllers/upload.controller.ts`, `backend/package.json`, `backend/vitest.config.e2e.ts`.

Modified files (tests): `test/unit/config/env-validation.spec.ts`, `test/unit/config/app-config.service.spec.ts`, `test/unit/modules/public/visualTest/intake/presentation/controllers/upload.controller.spec.ts`, `test/unit/modules/internal/data-deletion/tasks/rate-limit-bucket-cleanup.task.spec.ts` (renamed), `test/e2e/_support/utils/test-app.ts`, `test/e2e/visualTest/rate-limit.e2e-spec.ts` (unchanged, verified).

Docs: `README.md`, `backend/.env.local.example`, `backend/.env.staging.example`, `backend/.env.production.example`, `docs/deployment.md`, `docs/adr/025-authentication.md`, new `docs/adr/026-rate-limit-unification.md`.

---

## Task 1: Generic `RateLimitBucket` table + renamed cleanup task

Swap the schema from the API-key-specific table to a generic scope/key bucket, and re-point every consumer of the old table (cleanup task, maintenance lock id, e2e DB reset) at the new one.

**Files:**

- Modify: `backend/prisma/schema.prisma` (remove `rateLimitBuckets` field from `ApiKey`, replace `ApiKeyRateLimitBucket` model)
- Modify: `backend/src/common/domain/metrics-catalog.ts`
- Modify: `backend/src/modules/internal/data-deletion/maintenance-lock-ids.ts`
- Modify: `backend/src/modules/internal/data-deletion/data-deletion.module.ts`
- Rename: `backend/src/modules/internal/data-deletion/tasks/upload-rate-limit-bucket-cleanup.task.ts` → `rate-limit-bucket-cleanup.task.ts` (class → `RateLimitBucketCleanupTask`)
- Rename: `backend/test/unit/modules/internal/data-deletion/tasks/upload-rate-limit-bucket-cleanup.task.spec.ts` → `rate-limit-bucket-cleanup.task.spec.ts`
- Modify: `backend/test/e2e/_support/utils/test-app.ts`

- [ ] **Step 1: Edit the Prisma schema**

In `ApiKey` remove the relation field so the model becomes:

```prisma
model ApiKey {
  id        String    @id @default(cuid())
  name      String
  keyHash   String    @unique
  createdAt DateTime  @default(now())
  revokedAt DateTime?

  @@map("ApiKey")
}
```

Replace the whole `ApiKeyRateLimitBucket` model (lines 146–158) with:

```prisma
model RateLimitBucket {
  id          String   @id @default(cuid())
  scope       String   // "login" | "log" | "upload"
  key         String   // login/log: "ip:<ip>", upload: "apikey:<id>"
  windowStart DateTime // minute-aligned
  count       Int      @default(0)
  createdAt   DateTime @default(now())

  @@unique([scope, key, windowStart])
  @@index([windowStart])
  @@map("RateLimitBucket")
}
```

- [ ] **Step 2: Create the migration and regenerate the client**

Start Postgres if needed (`./scripts/dev.sh infra`), then run:

```
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres POSTGRES_DB=vrt DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vrt pnpm --filter ./backend exec prisma migrate dev --name rate_limit_bucket_unification
```

Expected: a new migration under `backend/prisma/migrations/` (Prisma drops `ApiKeyRateLimitBucket` and creates `RateLimitBucket`) and the generated client updated. Accept the data-loss prompt if shown (bucket counters are transient).

- [ ] **Step 3: Rename + retarget the cleanup task**

Delete `backend/src/modules/internal/data-deletion/tasks/upload-rate-limit-bucket-cleanup.task.ts` and create `backend/src/modules/internal/data-deletion/tasks/rate-limit-bucket-cleanup.task.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { METRICS } from "@common/domain/metrics-catalog";
import type {
  MaintenanceTask,
  MaintenanceResult,
} from "@common/domain/maintenance-task.interface";
import { MAINTENANCE_LOCK_IDS } from "@internal/data-deletion/maintenance-lock-ids";

// Sweeps RateLimitBucket rows older than one day. The counters are only
// meaningful inside their window, so the sweep keeps a day of history for
// monitoring and drops everything older. Not transaction-ambient: it runs on
// the bare connection like the sibling maintenance tasks.
const RATE_LIMIT_BUCKET_RETENTION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RateLimitBucketCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.rateLimitBucketCleanup;
  readonly label = "rate limit bucket cleanup";

  constructor(private readonly connection: PrismaConnection) {}

  async execute(): Promise<MaintenanceResult> {
    const cutoff = new Date(Date.now() - RATE_LIMIT_BUCKET_RETENTION_MS);
    const result = await this.connection.client.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: cutoff } },
    });
    return {
      gauges: [
        {
          name: METRICS.cleanupRateLimitBucketsDeleted,
          value: result.count,
        },
      ],
    };
  }
}
```

- [ ] **Step 4: Update the lock-id key**

In `backend/src/modules/internal/data-deletion/maintenance-lock-ids.ts` change `uploadRateLimitBucketCleanup: 1005` to:

```ts
  rateLimitBucketCleanup: 1005,
```

- [ ] **Step 5: Update the data-deletion module**

Rewrite `backend/src/modules/internal/data-deletion/data-deletion.module.ts` so it reads:

```ts
import { Module } from "@nestjs/common";
import { AppConfigModule } from "@config/app-config.module";
import { PrismaModule } from "@prisma/prisma.module";
import { StorageModule } from "@internal/storage/storage.module";
import { VisualTestInfraModule } from "@public/visualTest/core/visual-test-infra.module";
import { JobQueueModule } from "@internal/job-queue/job-queue.module";
import { PdfSidecarModule } from "@internal/pdf-sidecar/pdf-sidecar.module";
import {
  MAINTENANCE_TASKS,
  type MaintenanceTask,
} from "@common/domain/maintenance-task.interface";
import { MaintenanceCron } from "@internal/data-deletion/cron/maintenance.cron";
import { FailedJobCleanupTask } from "@internal/data-deletion/tasks/failed-job-cleanup.task";
import { PdfRenderCacheCleanupTask } from "@internal/data-deletion/tasks/pdf-render-cache-cleanup.task";
import { UnreferencedObjectCleanupTask } from "@internal/data-deletion/tasks/unreferenced-object-cleanup.task";
import { RateLimitBucketCleanupTask } from "@internal/data-deletion/tasks/rate-limit-bucket-cleanup.task";
import { OrphanCleanupService } from "./services/orphan-cleanup.service";
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    StorageModule,
    VisualTestInfraModule,
    JobQueueModule,
    PdfSidecarModule,
  ],
  providers: [
    MaintenanceCron,
    OrphanCleanupService,
    FailedJobCleanupTask,
    PdfRenderCacheCleanupTask,
    UnreferencedObjectCleanupTask,
    RateLimitBucketCleanupTask,
    {
      provide: MAINTENANCE_TASKS,
      useFactory: (
        orphanCleanupService: OrphanCleanupService,
        failedJobCleanupTask: FailedJobCleanupTask,
        pdfRenderCacheCleanupTask: PdfRenderCacheCleanupTask,
        unreferencedObjectCleanupTask: UnreferencedObjectCleanupTask,
        rateLimitBucketCleanupTask: RateLimitBucketCleanupTask,
      ) =>
        [
          orphanCleanupService,
          failedJobCleanupTask,
          pdfRenderCacheCleanupTask,
          unreferencedObjectCleanupTask,
          rateLimitBucketCleanupTask,
        ] as MaintenanceTask[],
      inject: [
        OrphanCleanupService,
        FailedJobCleanupTask,
        PdfRenderCacheCleanupTask,
        UnreferencedObjectCleanupTask,
        RateLimitBucketCleanupTask,
      ],
    },
  ],
  exports: [],
})
export class DataDeletionModule {}
```

- [ ] **Step 6: Rename the cleanup metric in the catalog**

In `backend/src/common/domain/metrics-catalog.ts` replace only the cleanup gauge (the counter entry `uploadRateLimitedTotal` stays until Task 2, where the new guard takes over):

```ts
  cleanupUploadRateLimitBucketsDeleted:
    'cleanup_upload_rate_limit_buckets_deleted',
```

becomes:

```ts
  cleanupRateLimitBucketsDeleted: 'cleanup_rate_limit_buckets_deleted',
```

- [ ] **Step 7: Update the e2e DB reset**

In `backend/test/e2e/_support/utils/test-app.ts` change line 60 `await db.apiKeyRateLimitBucket.deleteMany();` to:

```ts
await db.rateLimitBucket.deleteMany();
```

- [ ] **Step 8: Rewrite the cleanup-task spec**

Delete the old spec and create `backend/test/unit/modules/internal/data-deletion/tasks/rate-limit-bucket-cleanup.task.spec.ts`:

```ts
import { Test, TestingModule } from "@nestjs/testing";
import type { Mocked } from "vitest";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { RateLimitBucketCleanupTask } from "@internal/data-deletion/tasks/rate-limit-bucket-cleanup.task";
import { createMock } from "@test/utils/create-mock";

describe("RateLimitBucketCleanupTask", () => {
  let task: RateLimitBucketCleanupTask;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      rateLimitBucket: { deleteMany: vi.fn() },
    };
    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, "client", { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitBucketCleanupTask,
        { provide: PrismaConnection, useValue: mockConnection },
      ],
    }).compile();

    task = module.get(RateLimitBucketCleanupTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes buckets older than 24h and reports the deleted count", async () => {
    mockClient.rateLimitBucket.deleteMany.mockResolvedValue({ count: 4 });

    const result = await task.execute();

    expect(mockClient.rateLimitBucket.deleteMany).toHaveBeenCalledWith({
      where: { windowStart: { lt: expect.any(Date) } },
    });
    expect(result.gauges?.[0]).toEqual({
      name: expect.stringContaining("cleanup_rate_limit_buckets"),
      value: 4,
    });
  });

  it("emits a zero gauge when nothing was deleted", async () => {
    mockClient.rateLimitBucket.deleteMany.mockResolvedValue({ count: 0 });

    const result = await task.execute();

    expect(result.gauges?.[0]?.value).toBe(0);
  });
});
```

- [ ] **Step 9: Format, typecheck, and run the unit tests**

```
pnpm prettier --write "backend/src/**/*.ts" "backend/test/**/*.ts"
pnpm --filter ./backend typecheck && pnpm --filter ./backend typecheck:test
pnpm --filter ./backend test -- test/unit
```

Expected: green. (`src/.../upload-rate-limit.service.ts` still compiles — its raw-SQL string is not type-checked against the schema.)

- [ ] **Step 10: Commit**

```bash
git add backend/prisma backend/src backend/test
git commit -m "refactor: generic RateLimitBucket table for rate limiting"
```

Check the pre-commit hook output (SDK regen may restage `backend/swagger.json`/`client-sdk` — leave those in the commit).

---

## Task 2: New generic rate-limit mechanism, wired for `upload`

Create the shared module (window helpers, service, decorator, guard, module + specs), delete the upload-specific guard/service/window files, and switch `UploadController` to `@RateLimit('upload')` with the guard registered globally after `AuthenticationGuard`.

**Files:**

- Create: `backend/src/modules/internal/rate-limit/rate-limit-window.ts`
- Create: `backend/src/modules/internal/rate-limit/rate-limit.service.ts`
- Create: `backend/src/modules/internal/rate-limit/rate-limit.decorator.ts`
- Create: `backend/src/modules/internal/rate-limit/rate-limit.guard.ts`
- Create: `backend/src/modules/internal/rate-limit/rate-limit.module.ts`
- Create: three unit specs under `backend/test/unit/modules/internal/rate-limit/`
- Delete: the three old upload rate-limit files + their specs
- Modify: `backend/src/app.module.ts`, `backend/src/modules/public/visualTest/intake/presentation/controllers/upload.controller.ts`, `backend/src/modules/public/visualTest/intake/intake-application.module.ts`, `backend/test/unit/modules/public/visualTest/intake/presentation/controllers/upload.controller.spec.ts`

- [ ] **Step 1: Write the failing window-helper spec**

Create `backend/test/unit/modules/internal/rate-limit/rate-limit-window.spec.ts`:

```ts
import {
  computeWindowStart,
  retryAfterSeconds,
  RATE_LIMIT_WINDOW_MS,
} from "@internal/rate-limit/rate-limit-window";

describe("rate-limit-window", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("computeWindowStart", () => {
    it("floors a timestamp to its minute boundary", () => {
      const now = new Date("2026-08-24T10:15:37.250Z").getTime();
      expect(computeWindowStart(now).toISOString()).toBe(
        "2026-08-24T10:15:00.000Z",
      );
    });

    it("keeps an exact minute boundary unchanged", () => {
      const now = new Date("2026-08-24T10:15:00.000Z").getTime();
      expect(computeWindowStart(now).toISOString()).toBe(
        "2026-08-24T10:15:00.000Z",
      );
    });
  });

  describe("retryAfterSeconds", () => {
    it("returns the seconds until the next minute boundary, min 1", () => {
      const now = new Date("2026-08-24T10:15:37.000Z").getTime();
      expect(retryAfterSeconds(now)).toBe(23);
    });

    it("returns 60 exactly at a boundary", () => {
      const now = new Date("2026-08-24T10:15:00.000Z").getTime();
      expect(retryAfterSeconds(now)).toBe(60);
    });

    it("returns 1 at the very end of the window (min-1 clamp)", () => {
      const now = new Date("2026-08-24T10:15:59.500Z").getTime();
      expect(retryAfterSeconds(now)).toBe(1);
    });

    it("window constant is 60 seconds", () => {
      expect(RATE_LIMIT_WINDOW_MS).toBe(60_000);
    });
  });
});
```

- [ ] **Step 2: Create the window helper and watch the spec pass**

Create `backend/src/modules/internal/rate-limit/rate-limit-window.ts`:

```ts
export const RATE_LIMIT_WINDOW_MS = 60_000;

export function computeWindowStart(now: number): Date {
  return new Date(
    Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS,
  );
}

export function retryAfterSeconds(now: number): number {
  return Math.max(
    1,
    Math.ceil((RATE_LIMIT_WINDOW_MS - (now % RATE_LIMIT_WINDOW_MS)) / 1000),
  );
}
```

Run: `pnpm --filter ./backend test -- test/unit/modules/internal/rate-limit/rate-limit-window.spec.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing service spec**

Create `backend/test/unit/modules/internal/rate-limit/rate-limit.service.spec.ts`:

```ts
import { Test, TestingModule } from "@nestjs/testing";
import type { Mocked } from "vitest";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { RateLimitService } from "@internal/rate-limit/rate-limit.service";
import { createMock } from "@test/utils/create-mock";

describe("RateLimitService", () => {
  let service: RateLimitService;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: { $queryRaw: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockClient = { $queryRaw: vi.fn() };
    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, "client", { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: PrismaConnection, useValue: mockConnection },
      ],
    }).compile();

    service = module.get(RateLimitService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the atomic upsert and reports allowed under the limit", async () => {
    mockClient.$queryRaw.mockResolvedValue([{ count: 5 }]);

    const result = await service.tryConsume("upload", "apikey:k1", 60);

    expect(result).toEqual({ allowed: true, count: 5 });
    expect(mockClient.$queryRaw).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "upload",
      "apikey:k1",
      expect.any(Date),
    );
  });

  it("reports rejected at the limit boundary (count > limit)", async () => {
    mockClient.$queryRaw.mockResolvedValue([{ count: 61 }]);

    const result = await service.tryConsume("upload", "apikey:k1", 60);

    expect(result).toEqual({ allowed: false, count: 61 });
  });

  it("treats an empty result as a zero count", async () => {
    mockClient.$queryRaw.mockResolvedValue([]);

    const result = await service.tryConsume("login", "ip:203.0.113.9", 5);

    expect(result).toEqual({ allowed: true, count: 0 });
  });
});
```

- [ ] **Step 4: Create the service and watch the spec pass**

Create `backend/src/modules/internal/rate-limit/rate-limit.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { computeWindowStart } from "./rate-limit-window";

// The per-scope rate-limit bucket. Deliberately NOT transaction-ambient: the
// guard runs this check before the route handler, so it writes on the bare
// connection. The atomic INSERT ... ON CONFLICT ... RETURNING rules out the
// read-then-write race a Prisma upsert would have under concurrent requests.
@Injectable()
export class RateLimitService {
  constructor(private readonly connection: PrismaConnection) {}

  async tryConsume(
    scope: string,
    key: string,
    limit: number,
  ): Promise<{ allowed: boolean; count: number }> {
    const windowStart = computeWindowStart(Date.now());
    const rows = await this.connection.client.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("id", "scope", "key", "windowStart", "count", "createdAt")
      VALUES (${randomUUID()}, ${scope}, ${key}, ${windowStart}, 1, NOW())
      ON CONFLICT ("scope", "key", "windowStart")
      DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"
    `;
    const count = rows[0]?.count ?? 0;
    return { allowed: count <= limit, count };
  }
}
```

Run: `pnpm --filter ./backend test -- test/unit/modules/internal/rate-limit/rate-limit.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing guard spec**

Create `backend/test/unit/modules/internal/rate-limit/rate-limit.guard.spec.ts`:

```ts
import { HttpException, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import type { Mocked } from "vitest";
import { AppConfigService } from "@config/app-config.service";
import { METRICS } from "@common/domain/metrics-catalog";
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from "@common/domain/metrics-recorder.interface";
import { RateLimitService } from "@internal/rate-limit/rate-limit.service";
import { RateLimitGuard } from "@internal/rate-limit/rate-limit.guard";
import { createMock } from "@test/utils/create-mock";

describe("RateLimitGuard", () => {
  let guard: RateLimitGuard;
  let mockRateLimit: Mocked<RateLimitService>;
  let mockMetrics: Mocked<IMetricsRecorder>;
  let mockReflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

  const appConfig = {
    uploadRateLimitPerMinute: 60,
    loginRateLimitPerMinute: 5,
    logRateLimitPerMinute: 100,
  };

  const makeContext = (
    request: Record<string, unknown>,
    scope: string | undefined,
  ) => {
    mockReflector.getAllAndOverride.mockReturnValue(scope);
    const response = { setHeader: vi.fn() };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as Parameters<RateLimitGuard["canActivate"]>[0];
    return { context, response };
  };

  beforeEach(async () => {
    mockRateLimit = createMock<RateLimitService>();
    mockMetrics = createMock<IMetricsRecorder>();
    mockReflector = { getAllAndOverride: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: AppConfigService, useValue: appConfig },
        { provide: RateLimitService, useValue: mockRateLimit },
        { provide: METRICS_RECORDER, useValue: mockMetrics },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get(RateLimitGuard);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through when the handler has no @RateLimit metadata", async () => {
    const { context } = makeContext({ ip: "203.0.113.9" }, undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).not.toHaveBeenCalled();
  });

  it("skips when the scope limit is disabled (0)", async () => {
    appConfig.uploadRateLimitPerMinute = 0;
    const { context } = makeContext(
      { auth: { username: "ci", apiKeyId: "k1" } },
      "upload",
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).not.toHaveBeenCalled();

    appConfig.uploadRateLimitPerMinute = 60;
  });

  it("consumes the login bucket keyed by ip", async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: true, count: 2 });
    const { context } = makeContext({ ip: "203.0.113.9" }, "login");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).toHaveBeenCalledWith(
      "login",
      "ip:203.0.113.9",
      5,
    );
  });

  it("consumes the log bucket keyed by ip", async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: true, count: 1 });
    const { context } = makeContext({ ip: "203.0.113.9" }, "log");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).toHaveBeenCalledWith(
      "log",
      "ip:203.0.113.9",
      100,
    );
  });

  it("consumes the upload bucket keyed by api key", async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: true, count: 3 });
    const { context } = makeContext(
      { auth: { username: "ci", apiKeyId: "k1" } },
      "upload",
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).toHaveBeenCalledWith(
      "upload",
      "apikey:k1",
      60,
    );
  });

  it("does not count a session upload without an apiKeyId", async () => {
    const { context } = makeContext({ auth: { username: "alice" } }, "upload");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockRateLimit.tryConsume).not.toHaveBeenCalled();
  });

  it("rejects with 429, Retry-After and a scope metric over the limit", async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: false, count: 61 });
    const { context, response } = makeContext(
      { auth: { username: "ci", apiKeyId: "k1" } },
      "upload",
    );

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      "Retry-After",
      expect.stringMatching(/^\d+$/),
    );
    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      METRICS.rateLimitedTotal,
      { scope: "upload" },
    );
  });

  it("rejects an over-limit login with 429", async () => {
    mockRateLimit.tryConsume.mockResolvedValue({ allowed: false, count: 6 });
    const { context } = makeContext({ ip: "203.0.113.9" }, "login");

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
```

- [ ] **Step 6: Create the decorator, guard, and module — and rename the counter metric**

Rename the counter in `backend/src/common/domain/metrics-catalog.ts`:

```ts
  uploadRateLimitedTotal: 'upload_rate_limited_total',
```

becomes:

```ts
  rateLimitedTotal: 'rate_limited_total',
```

(The old upload guard, which still references `uploadRateLimitedTotal`, is deleted in Step 7 — the full-project typecheck runs at Step 12 after that deletion.)

Create `backend/src/modules/internal/rate-limit/rate-limit.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_SCOPE_KEY = "rateLimitScope";

export type RateLimitScope = "login" | "log" | "upload";

export const RateLimit = (scope: RateLimitScope) =>
  SetMetadata(RATE_LIMIT_SCOPE_KEY, scope);
```

Create `backend/src/modules/internal/rate-limit/rate-limit.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";
import { AppConfigService } from "@config/app-config.service";
import { AuthenticatedRequest } from "@common/http/authenticated-request";
import { METRICS } from "@common/domain/metrics-catalog";
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from "@common/domain/metrics-recorder.interface";
import { RateLimitService } from "./rate-limit.service";
import { retryAfterSeconds } from "./rate-limit-window";
import { RATE_LIMIT_SCOPE_KEY, RateLimitScope } from "./rate-limit.decorator";

// The single rate-limit rule: consume one unit from the scope's one-minute
// bucket in Postgres. Registered as a global APP_GUARD after the
// AuthenticationGuard; a pass-through on every route that carries no
// @RateLimit decorator. Runs before route interceptors, so a rejected upload
// never reaches multer, storage, or the workflow.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly appConfig: AppConfigService,
    private readonly rateLimit: RateLimitService,
    @Inject(METRICS_RECORDER) private readonly metrics: IMetricsRecorder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<RateLimitScope>(
      RATE_LIMIT_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) return true;

    const limit = this.limitFor(scope);
    if (limit <= 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = this.bucketKey(scope, request);
    if (!key) return true;

    const now = Date.now();
    const { allowed } = await this.rateLimit.tryConsume(scope, key, limit);
    if (allowed) return true;

    this.metrics.incrementCounter(METRICS.rateLimitedTotal, { scope });
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader("Retry-After", String(retryAfterSeconds(now)));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Rate limit exceeded for ${scope}. Retry after the current minute window.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private limitFor(scope: RateLimitScope): number {
    switch (scope) {
      case "login":
        return this.appConfig.loginRateLimitPerMinute;
      case "log":
        return this.appConfig.logRateLimitPerMinute;
      case "upload":
        return this.appConfig.uploadRateLimitPerMinute;
    }
  }

  private bucketKey(
    scope: RateLimitScope,
    request: AuthenticatedRequest,
  ): string | undefined {
    switch (scope) {
      case "login":
      case "log":
        return `ip:${request.ip}`;
      case "upload":
        return request.auth?.apiKeyId
          ? `apikey:${request.auth.apiKeyId}`
          : undefined;
    }
  }
}
```

Create `backend/src/modules/internal/rate-limit/rate-limit.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "@prisma/prisma.module";
import { RateLimitService } from "./rate-limit.service";

// Exposes RateLimitService so AppModule's global RateLimitGuard can consume it
// without AppModule wiring Prisma itself.
@Module({
  imports: [PrismaModule],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
```

Run: `pnpm --filter ./backend test -- test/unit/modules/internal/rate-limit/rate-limit.guard.spec.ts`
Expected: PASS.

- [ ] **Step 7: Delete the old upload-specific files and specs**

Delete:

- `backend/src/modules/public/visualTest/intake/presentation/guards/upload-rate-limit.guard.ts`
- `backend/src/modules/public/visualTest/intake/application/upload-rate-limit.service.ts`
- `backend/src/modules/public/visualTest/intake/application/upload-rate-limit-window.ts`
- `backend/test/unit/modules/public/visualTest/intake/presentation/guards/upload-rate-limit.guard.spec.ts`
- `backend/test/unit/modules/public/visualTest/intake/application/upload-rate-limit.service.spec.ts`
- `backend/test/unit/modules/public/visualTest/intake/application/upload-rate-limit-window.spec.ts`

- [ ] **Step 8: Register RateLimitModule + RateLimitGuard in AppModule**

In `backend/src/app.module.ts`:

- Add imports: `import { RateLimitModule } from '@internal/rate-limit/rate-limit.module';` and `import { RateLimitGuard } from '@internal/rate-limit/rate-limit.guard';`
- Add `RateLimitModule,` to `imports`.
- In `providers`, add a second `APP_GUARD` entry immediately after the existing `AuthenticationGuard` entry:

```ts
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
```

Leave the `ThrottlerGuard` entry and `ThrottleConfigModule` import in place for now (removed in Task 3). Resulting guard order this task: `ThrottlerGuard`, `AuthenticationGuard`, `RateLimitGuard`.

- [ ] **Step 9: Switch the upload controller to the decorator**

In `backend/src/modules/public/visualTest/intake/presentation/controllers/upload.controller.ts`:

- Remove the import of `UploadRateLimitGuard`.
- Remove `UseGuards` from the `@nestjs/common` import list (verify no other `@UseGuards` remains in the file after this step).
- Add `import { RateLimit } from '@internal/rate-limit/rate-limit.decorator';`
- Replace the class-level `@UseGuards(UploadRateLimitGuard)` with `@RateLimit('upload')` (same position, class level — the controller's single route is the upload route).

The controller top should read:

```ts
@ApiTags('Upload')
@RateLimit('upload')
@ApiExtraModels(
  BaselineCreatedResultDto,
  IdenticalResultDto,
  ComparisonQueuedResultDto,
)
@Controller('projects/:projectName/tests')
export class UploadController {
```

- [ ] **Step 10: Drop the old providers from the intake module**

In `backend/src/modules/public/visualTest/intake/intake-application.module.ts` remove the `UploadRateLimitService` and `UploadRateLimitGuard` imports and their two entries in `providers`. Leave the `PrismaModule` import in place (still shared by the intake pipeline).

- [ ] **Step 11: Simplify the upload controller unit spec**

In `backend/test/unit/modules/public/visualTest/intake/presentation/controllers/upload.controller.spec.ts` remove the `UploadRateLimitService` import, its provider entry (`{ provide: UploadRateLimitService, useValue: ... }`), and the now-unused `METRICS_RECORDER` provider entry + import (the controller no longer wires them). Keep the rest of the spec unchanged.

- [ ] **Step 12: Format, typecheck, run unit tests**

```
pnpm prettier --write "backend/src/**/*.ts" "backend/test/**/*.ts"
pnpm --filter ./backend typecheck && pnpm --filter ./backend typecheck:test
pnpm --filter ./backend test -- test/unit
```

Expected: green. Upload now rate-limits through the generic guard only (the global `default` per-IP throttler still applies until Task 3 — harmless, its 1000/min budget is never reached in tests).

- [ ] **Step 13: Commit**

```bash
git add backend/src backend/test
git commit -m "feat: unified Postgres rate-limit guard for upload scope"
```

---

## Task 3: Drop `@nestjs/throttler`, add `login`/`log` scopes, new env knobs

Remove the throttler library, its config module, the global flood guard, the `skipIf` scoping, and the TTL knobs; add `@RateLimit('login')` / `@RateLimit('log')`; move defaults into the Joi schema under the new per-minute env names.

**Files:**

- Modify: `backend/src/config/env.validation.ts`
- Modify: `backend/src/config/app-config.service.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/main.ts`
- Modify: `backend/src/modules/internal/auth/auth.controller.ts`
- Modify: `backend/src/modules/internal/logging/log-ingestion.controller.ts`
- Modify: `backend/src/modules/internal/health/health.controller.ts`
- Modify: `backend/src/modules/internal/metrics/metrics.controller.ts`
- Modify: `backend/vitest.config.e2e.ts`
- Modify: `backend/package.json`
- Delete: `backend/src/config/throttle-config.module.ts`, `backend/src/config/throttle-limits.ts`, `backend/test/unit/config/throttle-config.module.spec.ts`
- Modify: `backend/test/unit/config/env-validation.spec.ts`, `backend/test/unit/config/app-config.service.spec.ts`

- [ ] **Step 1: Update env validation**

In `backend/src/config/env.validation.ts`:

- Remove the `import { LOGIN_THROTTLE_DEFAULTS, LOG_THROTTLE_DEFAULTS } from '@config/throttle-limits';` import (lines 3–6).
- Replace the whole throttling block (lines 79–105: `THROTTLE_TTL` through the `LOG_THROTTLE_LIMIT` entry) with:

```ts
  // Rate limits — every rule is a fixed one-minute window expressed as
  // "requests per minute" for its scope; 0 disables the rule.
  UPLOAD_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(60)
    .description('Max upload requests per minute per API key'),
  LOGIN_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(5)
    .description('Max login attempts per minute per IP'),
  LOG_RATE_LIMIT_PER_MINUTE: Joi.number()
    .min(0)
    .default(100)
    .description('Max log-ingestion requests per minute per IP'),
```

- Update the `TRUST_PROXY` description to:

```ts
  TRUST_PROXY: Joi.boolean()
    .default(false)
    .description(
      'Trust X-Forwarded-For headers from the reverse proxy (nginx/ingress). Required for correct per-IP rate limiting of the login and log endpoints and client-IP logging behind a proxy. Disable when the app is directly reachable.',
    ),
```

- [ ] **Step 2: Update the config getters**

In `backend/src/config/app-config.service.ts`:

- Remove the `throttle`, `loginThrottle`, and `logThrottle` getters (lines 114–125), and the private `readThrottle` method plus its `// Throttle env vars are written in seconds...` comment (lines 170–179).
- Replace the `uploadRateLimitPerMinute` getter block (lines 127–129) with:

```ts
  get uploadRateLimitPerMinute(): number {
    return Number(this.config.get<string>('UPLOAD_RATE_LIMIT_PER_MINUTE'));
  }

  get loginRateLimitPerMinute(): number {
    return Number(this.config.get<string>('LOGIN_RATE_LIMIT_PER_MINUTE'));
  }

  get logRateLimitPerMinute(): number {
    return Number(this.config.get<string>('LOG_RATE_LIMIT_PER_MINUTE'));
  }
```

- [ ] **Step 3: Delete the throttler config and dependency**

Delete `backend/src/config/throttle-config.module.ts`, `backend/src/config/throttle-limits.ts`, and `backend/test/unit/config/throttle-config.module.spec.ts`.

Remove the dependency:

```
pnpm --filter ./backend remove @nestjs/throttler
```

- [ ] **Step 4: Update AppModule**

In `backend/src/app.module.ts`:

- Remove `import { ThrottlerGuard } from '@nestjs/throttler';`
- Remove `import { ThrottleConfigModule } from '@config/throttle-config.module';`
- Remove `ThrottleConfigModule,` from `imports`.
- Remove the first `APP_GUARD` entry (`{ provide: APP_GUARD, useClass: ThrottlerGuard }`).

`providers` now begins with `AllExceptionsFilter` (APP_FILTER), then `AuthenticationGuard`, then `RateLimitGuard`.

- [ ] **Step 5: Apply the decorators to login and log, drop SkipThrottle**

In `backend/src/modules/internal/auth/auth.controller.ts`:

- Add `import { RateLimit } from '@internal/rate-limit/rate-limit.decorator';`
- Add `@RateLimit('login')` above `async login(` (next to `@PublicEndpoint()`/`@Post('login')`).

In `backend/src/modules/internal/logging/log-ingestion.controller.ts`:

- Add `import { RateLimit } from '@internal/rate-limit/rate-limit.decorator';`
- Add `@RateLimit('log')` above `ingest(`.

In `backend/src/modules/internal/health/health.controller.ts` and `backend/src/modules/internal/metrics/metrics.controller.ts`:

- Remove the `import { SkipThrottle } from '@nestjs/throttler';` line and the `@SkipThrottle()` decorator.

- [ ] **Step 6: Update the main.ts comment**

In `backend/src/main.ts` replace lines 42–45 with:

```ts
// Trust X-Forwarded-For from the reverse proxy so the IP-keyed login/log
// rate limits and request logging see the real client IP (they collapse to
// the proxy IP otherwise). Opt-in via TRUST_PROXY; `false` keeps the default
// Express behavior for direct exposure.
```

- [ ] **Step 7: Update the e2e env config**

In `backend/vitest.config.e2e.ts` replace the two env entries (lines 59–60):

```ts
      LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
      LOG_RATE_LIMIT_PER_MINUTE: '1000',
      UPLOAD_RATE_LIMIT_PER_MINUTE: '0',
```

- [ ] **Step 8: Update the env-validation unit spec**

In `backend/test/unit/config/env-validation.spec.ts`:

- Replace the `'defaults the route-scoped throttle env vars'` test (lines 129–146) with:

```ts
it("defaults the per-minute rate-limit env vars", () => {
  const { value, error } = envValidationSchema.validate(
    {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/vrt",
      RUSTFS_ENDPOINT: "localhost",
      RUSTFS_ACCESS_KEY: "test-key",
      RUSTFS_SECRET_KEY: "test-secret",
      RUSTFS_BUCKET: "visual-tests",
      RUSTFS_PUBLIC_URL: "http://localhost:9000",
    },
    { abortEarly: false },
  );
  expect(error).toBeUndefined();
  expect(value.UPLOAD_RATE_LIMIT_PER_MINUTE).toBe(60);
  expect(value.LOGIN_RATE_LIMIT_PER_MINUTE).toBe(5);
  expect(value.LOG_RATE_LIMIT_PER_MINUTE).toBe(100);
});
```

- Replace the `'rejects a LOGIN_THROTTLE_LIMIT of 0'` test (lines 181–196) with:

```ts
it("rejects a negative LOGIN_RATE_LIMIT_PER_MINUTE", () => {
  const { error } = envValidationSchema.validate(
    {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/vrt",
      RUSTFS_ENDPOINT: "localhost",
      RUSTFS_ACCESS_KEY: "test-key",
      RUSTFS_SECRET_KEY: "test-secret",
      RUSTFS_BUCKET: "visual-tests",
      RUSTFS_PUBLIC_URL: "http://localhost:9000",
      LOGIN_RATE_LIMIT_PER_MINUTE: -1,
    },
    { abortEarly: false },
  );
  expect(error).toBeDefined();
  expect(error?.message).toContain("LOGIN_RATE_LIMIT_PER_MINUTE");
});
```

- [ ] **Step 9: Update the app-config unit spec**

In `backend/test/unit/config/app-config.service.spec.ts`:

- In `baseValues`, replace the `THROTTLE_TTL: 60, THROTTLE_LIMIT: 1000,` lines (30–31) with:

```ts
    UPLOAD_RATE_LIMIT_PER_MINUTE: 60,
    LOGIN_RATE_LIMIT_PER_MINUTE: 5,
    LOG_RATE_LIMIT_PER_MINUTE: 100,
```

- Replace the `'exposes the throttle group with ttl converted to milliseconds'` test (lines 116–120) with:

```ts
it("exposes the per-minute rate limits", () => {
  const config = buildAppConfig(baseValues);
  expect(config.uploadRateLimitPerMinute).toBe(60);
  expect(config.loginRateLimitPerMinute).toBe(5);
  expect(config.logRateLimitPerMinute).toBe(100);
});
```

- [ ] **Step 10: Format, typecheck, run unit tests**

```
pnpm prettier --write "backend/src/**/*.ts" "backend/test/**/*.ts"
pnpm --filter ./backend typecheck && pnpm --filter ./backend typecheck:test
pnpm --filter ./backend test -- test/unit
```

Expected: green — no remaining reference to `@nestjs/throttler`, `ThrottleConfigModule`, `SkipThrottle`, `ThrottlerGuard`, `THROTTLE_*`, `LOGIN_THROTTLE_*`, or `LOG_THROTTLE_*`. Verify with:

```
rg -n "nestjs/throttler|Throttler|SkipThrottle|THROTTLE_|LOGIN_THROTTLE|LOG_THROTTLE" backend/src backend/test backend/package.json || echo clean
```

- [ ] **Step 11: Commit**

```bash
git add backend
git commit -m "refactor: replace throttler with scoped Postgres rate limits"
```

---

## Task 4: E2E coverage for the login and log scopes

**Files:**

- Create: `backend/test/e2e/rate-limit-login.e2e-spec.ts`
- Verify: `backend/test/e2e/visualTest/rate-limit.e2e-spec.ts` (unchanged)

- [ ] **Step 1: Write the e2e spec**

Create `backend/test/e2e/rate-limit-login.e2e-spec.ts`:

```ts
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { TestApp } from "../_support/utils/test-app";
import { hashPassword } from "@internal/auth/password-hasher";

describe("Login and log rate limits (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
    await TestApp.resetDb();
    const db = app.get(PrismaConnection).client;
    await db.rateLimitBucket.deleteMany();
    await db.user.create({
      data: {
        username: "admin",
        passwordHash: await hashPassword("secret"),
      },
    });
    // ConfigService.set wins over the validated env at read time (the rate-limit
    // values are read through AppConfigService on every request).
    app.get(ConfigService).set("LOGIN_RATE_LIMIT_PER_MINUTE", "2");
    app.get(ConfigService).set("LOG_RATE_LIMIT_PER_MINUTE", "2");
  });

  afterAll(async () => {
    app.get(ConfigService).set("LOGIN_RATE_LIMIT_PER_MINUTE", "1000");
    app.get(ConfigService).set("LOG_RATE_LIMIT_PER_MINUTE", "1000");
    const db = app.get(PrismaConnection).client;
    await db.rateLimitBucket.deleteMany();
    await TestApp.close();
  });

  it("rejects the 3rd login attempt in a minute window with 429 and Retry-After", async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ username: "admin", password: "wrong" });

    await attempt().expect(401);
    await attempt().expect(401);

    const res = await attempt().expect(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("rejects the 3rd log-ingestion post in a minute window with 429 and Retry-After", async () => {
    const postLog = () =>
      request(app.getHttpServer()).post("/api/v1/log").send({ message: "x" });

    await postLog().expect(204);
    await postLog().expect(204);

    const res = await postLog().expect(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the full backend e2e suite**

```
pnpm run e2eTest
```

Expected: all green, including the pre-existing upload rate-limit spec and the new login/log spec.

- [ ] **Step 3: Commit**

```bash
git add backend/test/e2e
git commit -m "test: e2e coverage for login and log rate limits"
```

---

## Task 5: Docs, env examples, and ADR

**Files:**

- Modify: `README.md`
- Modify: `backend/.env.local.example`, `backend/.env.staging.example`, `backend/.env.production.example`
- Modify: `docs/deployment.md`
- Modify: `docs/adr/025-authentication.md`
- Create: `docs/adr/026-rate-limit-unification.md`

- [ ] **Step 1: Update the README env table and Security Considerations**

In `README.md`:

Replace the `TRUST_PROXY` and `UPLOAD_RATE_LIMIT_PER_MINUTE` rows of the env table (lines 203–204) with:

```md
| `TRUST_PROXY` | Trust `X-Forwarded-For` from the reverse proxy — set `true` behind nginx/ingress so the per-IP login/log rate limits and logging see the real client IP (see Security Considerations) |
| `UPLOAD_RATE_LIMIT_PER_MINUTE` | Max uploads per minute per API key. `0` disables (default: `60`) |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | Max login attempts per minute per IP. `0` disables (default: `5`) |
| `LOG_RATE_LIMIT_PER_MINUTE` | Max log-ingestion requests per minute per IP. `0` disables (default: `100`) |
```

Replace the three Security Considerations bullets "Login throttling", "Per-key upload rate limit", and "Reverse proxy / per-IP throttling" (lines 372–374) with:

```md
- **Rate limits** — every limit is a counter per fixed one-minute window in
  Postgres, so limits hold across all backend instances. Three rules exist:
  uploads are capped per API key (`UPLOAD_RATE_LIMIT_PER_MINUTE`, default 60);
  `/auth/login` is capped per IP (`LOGIN_RATE_LIMIT_PER_MINUTE`, default 5) to
  slow brute force; log ingestion is capped per IP
  (`LOG_RATE_LIMIT_PER_MINUTE`, default 100). Exceeding a limit returns `429`
  with a `Retry-After` header. Setting a limit to `0` disables that rule. The
  upload rule counts only API-key callers; browser sessions never upload.
- **Per-IP rules and proxies** — only the two anonymous endpoints (login, log
  ingestion) are keyed by client IP. Set `TRUST_PROXY=true` when the backend is
  served behind the nginx/ingress reverse proxy so those per-IP rules and
  client-IP logging see the real client IP; keep it `false` when the backend is
  directly reachable (trusting proxy headers from a non-proxy client lets
  anyone spoof their IP and bypass the per-IP limits). Authenticated product
  routes are not IP-limited, so the switch does not affect them.
```

- [ ] **Step 2: Update the backend env examples**

In `backend/.env.local.example` replace the throttling block (lines 35–42) with:

```bash
# Rate limits (requests per minute; 0 disables)
UPLOAD_RATE_LIMIT_PER_MINUTE=60
LOGIN_RATE_LIMIT_PER_MINUTE=5
LOG_RATE_LIMIT_PER_MINUTE=100
```

In `backend/.env.staging.example` replace the block (lines 29–36) with the same three lines. In `backend/.env.production.example` replace the block (lines 40–47) with the same three lines. Keep the `TRUST_PROXY=false` lines that follow each block.

- [ ] **Step 3: Update docs/deployment.md**

In `docs/deployment.md`, in the "Reverse Proxy (TRUST_PROXY)" section, replace the sentence "…so per-IP rate limiting and client IP logging use the real client IP from `X-Forwarded-For` instead of the proxy's" so it scopes per-IP limiting to the login/log endpoints (mirror the README wording from Step 1). Add a short "Rate limits" paragraph listing the three `*_RATE_LIMIT_PER_MINUTE` env vars, their defaults, the `0`-disables semantics, the fixed one-minute window, and that `429` carries `Retry-After`.

- [ ] **Step 4: Update ADR-025**

In `docs/adr/025-authentication.md`, replace the "Route-scoped throttles" section (lines 56–76) with:

```md
### Route-scoped rate limits

Rate limits are one-minute-window counters in Postgres, applied by the global
`RateLimitGuard` only where a `@RateLimit(scope)` decorator is present:

- `login` — caps `POST /auth/login` per IP against brute force
  (`LOGIN_RATE_LIMIT_PER_MINUTE`, default 5/min).
- `log` — caps the public log-ingestion endpoint per IP
  (`LOG_RATE_LIMIT_PER_MINUTE`, default 100/min).
- `upload` — caps uploads per API key (`UPLOAD_RATE_LIMIT_PER_MINUTE`, default
  60/min).

A limit of `0` disables the rule. Because the counters live in Postgres, the
limits hold across backend replicas. `429` responses carry a `Retry-After`
header.

Only the two anonymous rules (login, log) are keyed by `req.ip`. Behind the
documented reverse proxy (nginx in `docker-compose`/Helm ingress), Express must
be told to trust `X-Forwarded-For` or every client shares the proxy's IP and
the per-IP budgets collapse into a shared limit. Set `TRUST_PROXY=true` in the
backend env behind a proxy; keep it `false` when the backend is directly
reachable. The switch is applied in `bootstrapApi()`
(`app.set('trust proxy', appConfig.trustProxy)`).
```

- [ ] **Step 5: Create ADR-026**

Create `docs/adr/026-rate-limit-unification.md`:

```md
# ADR 026: Rate-Limit Unification

## Status

Accepted — 2026-09-05

## Context

Rate limiting previously mixed two mechanisms: `@nestjs/throttler` (in-memory,
per-IP) applied a `default` flood guard to every route plus route-scoped
`login`/`log` throttlers wired via `skipIf`, and a custom Postgres bucket
(`ApiKeyRateLimitBucket`) capped uploads per API key. Operators had to reason
about five env knobs, a TTL-seconds↔milliseconds conversion, a per-IP
`TRUST_PROXY` switch that silently affected the whole API, and an odd split
("browser uploads are not counted per-key"). See
`docs/superpowers/specs/2026-09-05-rate-limit-unification-design.md`.

## Decision

One uniform mechanism: a rate-limit rule is a counter row in Postgres for a
fixed one-minute window, keyed by `(scope, key)`. The generic `RateLimitBucket`
table replaces `ApiKeyRateLimitBucket`. A global `RateLimitGuard` (registered
after `AuthenticationGuard`) is a pass-through unless a handler carries
`@RateLimit(scope)`; exactly three handlers do — upload (key `apikey:<id>`),
login (key `ip:<ip>`), log ingestion (key `ip:<ip>`).

- `@nestjs/throttler`, the global `default` flood guard, the `skipIf`
  machinery, and the TTL knobs are removed. Authenticated product traffic
  (lists, approvals) is deliberately not rate limited in this private/trusted
  network; the meaningful abuse surfaces are uploads and the anonymous
  endpoints.
- Env collapses to `UPLOAD_RATE_LIMIT_PER_MINUTE`, `LOGIN_RATE_LIMIT_PER_MINUTE`,
  `LOG_RATE_LIMIT_PER_MINUTE` (all "per minute", `0` disables) and
  `TRUST_PROXY`.
- `TRUST_PROXY` now affects only the two per-IP anonymous rules, shrinking its
  blast radius.
- The 429 metric is generalized to `rate_limited_total` with a `scope` label.

## Consequences

- Counters persist across backend replicas for every rule (previously only the
  upload rule did).
- Each rate-limited request performs one atomic `INSERT ... ON CONFLICT`
  write; non-limited routes touch the DB only as before.
- **Breaking:** existing deployments must rename `LOGIN_THROTTLE_*` /
  `LOG_THROTTLE_*` to `LOGIN_RATE_LIMIT_PER_MINUTE` / `LOG_RATE_LIMIT_PER_MINUTE`,
  drop `THROTTLE_TTL` / `THROTTLE_LIMIT`, and run the `RateLimitBucket`
  migration (see ADR-024).
- `@nestjs/throttler` is removed from dependencies.
```

- [ ] **Step 6: Format and run the full verification order**

```
pnpm prettier --write "README.md" "docs/**/*.md" "backend/.env*.example"
pnpm --filter ./backend lint:check
pnpm run typecheck:all
pnpm run format:check
pnpm run unitTest
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add README.md docs backend/.env.local.example backend/.env.staging.example backend/.env.production.example
git commit -m "docs: document unified per-minute rate limits"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the complete backend e2e suite**

```
pnpm run e2eTest
```

Expected: all e2e specs pass (requires Docker infra; the runner starts it).

- [ ] **Step 2: Run the full quality gate**

```
pnpm --filter ./backend lint:check
pnpm run typecheck:all
pnpm run format:check
pnpm run unitTest
```

- [ ] **Step 3: Confirm no leftovers**

```
rg -n "nestjs/throttler|Throttler|SkipThrottle|THROTTLE_|LOGIN_THROTTLE|LOG_THROTTLE|ApiKeyRateLimitBucket|apiKeyRateLimitBucket|upload_rate_limited|UploadRateLimitGuard|UploadRateLimitService|upload-rate-limit" backend README.md docs .env.example --iglob '!backend/prisma/migrations/**' || echo clean
```

Expected: only historical wording in the new ADR/spec/docs remains if any match — no code references. (The Prisma migration SQL under `backend/prisma/migrations/` legitimately names the old table in its `DROP` statement and is excluded.)

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore: finalize rate-limit unification" || echo "nothing to commit"
```
