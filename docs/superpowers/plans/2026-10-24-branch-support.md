# Branch-Scoped Baselines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tests, baselines, comparisons, reviews and status branch-scoped per project, with feature branches inheriting the target branch's baseline until their first approval.

**Architecture:** A new `Branch` entity belongs to a `Project`; `UnifiedTest` moves from `(projectId, name)` to `(branchId, name)`. Feature branches lazily materialize tests on upload and clone inherited baseline rows from the target chain. Reads use a recursive-CTE "Branch View" that surfaces unmaterialized ancestor tests as `inherited`. The existing comparison/status/retirement machinery stays untouched because it is already test-scoped.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Vitest, Vue 3 + TanStack Query, generated `@hey-api/openapi-ts` SDK.

**Spec:** `docs/superpowers/specs/2026-10-24-branch-support-design.md`

---

## Executor Notes

- Run all commands from the repository root unless a task says otherwise.
- Backend tests: `pnpm --filter ./backend test -- test/unit`
- One test file: `pnpm --filter ./backend test -- <path>`
- Frontend tests: `pnpm --filter ./frontend test -- --run <path>`
- Typecheck: `pnpm run typecheck:all`
- Migration commands need infra: `./scripts/dev.sh infra`
- Keep the tree compiling at every commit. That is why the schema adds
  `UnifiedTest.branchId` as nullable first and removes `projectId` only in
  Task 16.
- Never edit `*.gen.ts` files by hand; regenerate the SDK in Task 12.
- Do not add comments to production code unless a task explicitly shows one.

---

## Task 1: Branch schema (non-breaking)

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_branch_support/migration.sql`
- Modify: `backend/test/e2e/_support/utils/test-app.ts`

- [ ] **Step 1: Add the Branch model and nullable branch link**

In `backend/prisma/schema.prisma`, replace the `Project` and `UnifiedTest` models and add `Branch`, then add `isInherited` to `UnifiedVariant`:

```prisma
model Project {
  id              String        @id @default(cuid())
  name            String        @unique
  createdAt       DateTime      @default(now())
  groupId         String?
  group           ProjectGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  defaultBranchId String?       @unique
  defaultBranch   Branch?       @relation("DefaultBranch", fields: [defaultBranchId], references: [id], onDelete: SetNull)
  branches        Branch[]      @relation("ProjectBranches")
  unifiedTests    UnifiedTest[]

  @@index([groupId])
}

model Branch {
  id              String       @id @default(cuid())
  project         Project      @relation("ProjectBranches", fields: [projectId], references: [id], onDelete: Cascade)
  projectId       String
  name            String
  targetBranchId  String?
  targetBranch    Branch?      @relation("BranchTarget", fields: [targetBranchId], references: [id], onDelete: SetNull)
  derivedBranches Branch[]     @relation("BranchTarget")
  defaultFor      Project?     @relation("DefaultBranch")
  isArchived      Boolean      @default(false)
  createdAt       DateTime     @default(now())
  tests           UnifiedTest[]

  @@unique([projectId, name])
  @@index([targetBranchId])
  @@map("Branch")
}

model UnifiedTest {
  id        String     @id @default(cuid())
  project   Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId String
  branch    Branch?    @relation(fields: [branchId], references: [id], onDelete: Cascade)
  branchId  String?
  name      String
  kind      TestKind   @default(image)
  status    TestStatus @default(PENDING)
  createdAt DateTime   @default(now())

  variants     UnifiedVariant[]
  screenshots  UnifiedScreenshot[]
  comparisons  UnifiedComparison[]

  @@unique([projectId, name])
  @@unique([branchId, name])
  @@map("UnifiedTest")
}
```

Add to `UnifiedVariant`:

```prisma
  isInherited Boolean @default(false)
```

- [ ] **Step 2: Create the migration**

Run:

```bash
./scripts/dev.sh infra
cd backend
pnpm exec prisma migrate dev --create-only --name add_branch_support
```

Prisma creates `backend/prisma/migrations/<timestamp>_add_branch_support/migration.sql`. Replace its contents with:

```sql
-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetBranchId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "defaultBranchId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_projectId_name_key" ON "Branch"("projectId", "name");
CREATE INDEX "Branch_targetBranchId_idx" ON "Branch"("targetBranchId");
CREATE UNIQUE INDEX "Project_defaultBranchId_key" ON "Project"("defaultBranchId");

-- Backfill: one main branch per project
INSERT INTO "Branch" ("id", "projectId", "name", "createdAt")
SELECT 'br_' || md5(p."id" || ':main'), p."id", 'main', CURRENT_TIMESTAMP
FROM "Project" p;

UPDATE "Project" p
SET "defaultBranchId" = b."id"
FROM "Branch" b
WHERE b."projectId" = p."id" AND b."name" = 'main';

-- Add nullable branch link to tests and backfill
ALTER TABLE "UnifiedTest" ADD COLUMN "branchId" TEXT;

UPDATE "UnifiedTest" t
SET "branchId" = p."defaultBranchId"
FROM "Project" p
WHERE t."projectId" = p."id";

CREATE UNIQUE INDEX "UnifiedTest_branchId_name_key" ON "UnifiedTest"("branchId", "name");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_targetBranchId_fkey" FOREIGN KEY ("targetBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UnifiedTest" ADD CONSTRAINT "UnifiedTest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "UnifiedVariant" ADD COLUMN "isInherited" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Apply the migration and regenerate Prisma**

Run:

```bash
cd backend
pnpm exec prisma migrate dev
pnpm run prisma:generate
```

Expected: migration applies, Prisma client regenerates.

- [ ] **Step 4: Make the e2e reset branch-aware**

In `backend/test/e2e/_support/utils/test-app.ts`, add `await db.branch.deleteMany();` immediately before `await db.project.deleteMany();`.

- [ ] **Step 5: Verify the backfill**

Run:

```bash
cd backend
pnpm exec prisma migrate status
pnpm run typecheck
```

Expected: all migrations applied, typecheck passes (old code still compiles because `branchId` is nullable and `projectId` still exists).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/test/e2e/_support/utils/test-app.ts
git commit -m "feat(db): add branch schema"
```

---

## Task 2: Default branch on project creation

**Files:**

- Modify: `backend/src/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.ts`
- Test: `backend/test/unit/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

In `prisma-project.repository.spec.ts`, replace the `create` expectations with a test that asserts a project is created with its `main` branch and then linked as default:

```ts
describe("create", () => {
  it("creates the project with a main branch and links it as default", async () => {
    mockClient.project.create.mockResolvedValue({
      id: "proj-1",
      name: "checkout-ui",
      createdAt: new Date(),
      branches: [{ id: "branch-1" }],
    });
    mockClient.project.update.mockResolvedValue({
      id: "proj-1",
      name: "checkout-ui",
      createdAt: new Date(),
      defaultBranchId: "branch-1",
    });
    mockClient.$transaction.mockImplementation(async (fn: any) =>
      fn(mockClient),
    );

    await repository.create("checkout-ui");

    expect(mockClient.project.create).toHaveBeenCalledWith({
      data: {
        name: "checkout-ui",
        branches: { create: { name: "main" } },
      },
      include: { branches: { select: { id: true } } },
    });
    expect(mockClient.project.update).toHaveBeenCalledWith({
      where: { id: "proj-1" },
      data: { defaultBranchId: "branch-1" },
    });
  });
});
```

Add `};\n    mockClient.$transaction = vi.fn();` to the `mockClient` object in `beforeEach` if it is not already present.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.spec.ts
```

Expected: FAIL because `create` does not create a branch.

- [ ] **Step 3: Implement**

In `prisma-project.repository.ts`, replace `create`:

```ts
  async create(name: string, groupId?: string | null): Promise<ProjectData> {
    const existing = await this.client.project.findUnique({
      where: { name },
    });
    if (existing) {
      throw new DomainError('"name" already exists', 'E_UNIQUE_CONSTRAINT');
    }
    return (this.client as PrismaClient).$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          ...(groupId ? { groupId } : {}),
          branches: { create: { name: DEFAULT_BRANCH_NAME } },
        },
        include: { branches: { select: { id: true } } },
      });
      return tx.project.update({
        where: { id: project.id },
        data: { defaultBranchId: project.branches[0].id },
      });
    });
  }
```

Add imports at the top of the file:

```ts
import { PrismaClient } from "@/prisma/client";
import { DEFAULT_BRANCH_NAME } from "@public/visualTest/core/domain/constants/branch.constants";
```

Create `backend/src/modules/public/visualTest/core/domain/constants/branch.constants.ts`:

```ts
export const DEFAULT_BRANCH_NAME = "main";
export const MAX_BRANCH_NAME_LENGTH = 255;
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/public/visualTest/core backend/test/unit/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.spec.ts
git commit -m "feat(branch): create main branch with every project"
```

---

## Task 3: Branch name validation

**Files:**

- Create: `backend/src/common/http/pipes/branch-name-validation.pipe.ts`
- Test: `backend/test/unit/common/pipes/branch-name-validation.pipe.spec.ts`
- Modify: `backend/src/modules/public/visualTest/review/presentation/dto/project.dto.ts` (or create `branch.dto.ts`)

Branch names are not project names: they may contain `/`, `.` and `_`. Use a dedicated validator.

- [ ] **Step 1: Write the failing test**

Create `backend/test/unit/common/pipes/branch-name-validation.pipe.spec.ts`:

```ts
import { BadRequestException } from "@nestjs/common";
import { BranchNameValidationPipe } from "@common/http/pipes/branch-name-validation.pipe";

describe("BranchNameValidationPipe", () => {
  const pipe = new BranchNameValidationPipe();

  it("accepts git-style branch names", () => {
    expect(pipe.transform("feature/checkout-v2")).toBe("feature/checkout-v2");
    expect(pipe.transform("release/1.2.3")).toBe("release/1.2.3");
    expect(pipe.transform("main")).toBe("main");
  });

  it("trims surrounding whitespace", () => {
    expect(pipe.transform("  feature/x  ")).toBe("feature/x");
  });

  it("rejects empty names", () => {
    expect(() => pipe.transform("   ")).toThrow(BadRequestException);
  });

  it("rejects control characters", () => {
    expect(() => pipe.transform("feature/\u0000x")).toThrow(
      BadRequestException,
    );
  });

  it("rejects names over 255 characters", () => {
    expect(() => pipe.transform("a".repeat(256))).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./backend test -- test/unit/common/pipes/branch-name-validation.pipe.spec.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pipe**

Create `backend/src/common/http/pipes/branch-name-validation.pipe.ts`:

```ts
import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { MAX_BRANCH_NAME_LENGTH } from "@public/visualTest/core/domain/constants/branch.constants";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

@Injectable()
export class BranchNameValidationPipe implements PipeTransform<string> {
  transform(value: string): string {
    const name = value.trim();
    if (name.length === 0) {
      throw new BadRequestException("Branch name must not be empty");
    }
    if (name.length > MAX_BRANCH_NAME_LENGTH) {
      throw new BadRequestException(
        `Branch name too long (max ${MAX_BRANCH_NAME_LENGTH} characters)`,
      );
    }
    if (CONTROL_CHARS.test(name)) {
      throw new BadRequestException("Branch name contains control characters");
    }
    return name;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter ./backend test -- test/unit/common/pipes/branch-name-validation.pipe.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/http/pipes/branch-name-validation.pipe.ts backend/test/unit/common/pipes/branch-name-validation.pipe.spec.ts backend/src/modules/public/visualTest/core/domain/constants/branch.constants.ts
git commit -m "feat(branch): validate branch names"
```

---

## Task 4: Branch repository and resolver

**Files:**

- Create: `backend/src/modules/public/visualTest/core/infrastructure/repositories/branch.repository.ts`
- Create: `backend/src/modules/public/visualTest/core/application/services/branch-resolver.service.ts`
- Modify: `backend/src/modules/public/visualTest/core/visual-test-infra.module.ts`
- Modify: `backend/src/modules/public/visualTest/core/visual-test-application.module.ts`
- Test: `backend/test/unit/modules/public/visualTest/core/application/services/branch-resolver.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/test/unit/modules/public/visualTest/core/application/services/branch-resolver.service.spec.ts`:

```ts
import type { Mocked } from "vitest";
import { BranchResolver } from "@public/visualTest/core/application/services/branch-resolver.service";
import { BranchRepository } from "@public/visualTest/core/infrastructure/repositories/branch.repository";
import { ProjectRepository } from "@public/visualTest/core/infrastructure/repositories/prisma-project.repository";
import { createMock } from "@test/utils/create-mock";

describe("BranchResolver", () => {
  let resolver: BranchResolver;
  let projects: Mocked<ProjectRepository>;
  let branches: Mocked<BranchRepository>;

  const project = { id: "proj-1", name: "app", createdAt: new Date() };
  const main = {
    id: "br-main",
    projectId: "proj-1",
    name: "main",
    targetBranchId: null,
    isArchived: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    projects = createMock<ProjectRepository>();
    branches = createMock<BranchRepository>();
    resolver = new BranchResolver(projects, branches);
  });

  describe("resolveRead", () => {
    it("returns the default branch when no branch is given", async () => {
      projects.findByName.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);

      await expect(resolver.resolveRead("app")).resolves.toEqual({
        projectId: "proj-1",
        branchId: "br-main",
        branchName: "main",
        isDefault: true,
        isArchived: false,
      });
    });

    it("returns a named branch", async () => {
      projects.findByName.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue({
        ...main,
        id: "br-feature",
        name: "feature/x",
      });

      await expect(resolver.resolveRead("app", "feature/x")).resolves.toEqual({
        projectId: "proj-1",
        branchId: "br-feature",
        branchName: "feature/x",
        isDefault: false,
        isArchived: false,
      });
    });

    it("throws NOT_FOUND for an unknown project", async () => {
      projects.findByName.mockResolvedValue(null);

      await expect(resolver.resolveRead("missing")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("throws NOT_FOUND for an unknown branch", async () => {
      projects.findByName.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue(null);

      await expect(
        resolver.resolveRead("app", "feature/missing"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("resolveForUpload", () => {
    it("creates a missing branch targeting the default branch", async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue(null);
      branches.create.mockResolvedValue({
        ...main,
        id: "br-feature",
        name: "feature/x",
      });

      await resolver.resolveForUpload("app", "feature/x");

      expect(branches.create).toHaveBeenCalledWith("proj-1", "feature/x", null);
    });

    it("rejects uploads to an archived branch", async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue({
        ...main,
        id: "br-old",
        name: "old",
        isArchived: true,
      });

      await expect(
        resolver.resolveForUpload("app", "old"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rejects an explicit target that does not exist", async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue(null);

      await expect(
        resolver.resolveForUpload("app", "feature/x", "nope"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("assertValidTarget", () => {
    it("rejects self-targeting", async () => {
      await expect(
        resolver.assertValidTarget("proj-1", "br-1", "br-1"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rejects a cycle", async () => {
      branches.findById.mockResolvedValue({
        ...main,
        id: "br-2",
        name: "feature/y",
        targetBranchId: "br-1",
      });

      await expect(
        resolver.assertValidTarget("proj-1", "br-1", "br-2"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/core/application/services/branch-resolver.service.spec.ts
```

Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `BranchRepository`**

Create `backend/src/modules/public/visualTest/core/infrastructure/repositories/branch.repository.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { BaseRepository } from "@/prisma/base.repository";
import { DEFAULT_BRANCH_NAME } from "@public/visualTest/core/domain/constants/branch.constants";

export interface BranchRow {
  id: string;
  projectId: string;
  name: string;
  targetBranchId: string | null;
  isArchived: boolean;
  createdAt: Date;
}

const BRANCH_SELECT = {
  id: true,
  projectId: true,
  name: true,
  targetBranchId: true,
  isArchived: true,
  createdAt: true,
} as const;

@Injectable()
export class BranchRepository extends BaseRepository {
  async findDefault(projectId: string): Promise<BranchRow | null> {
    return this.client.branch.findFirst({
      where: { projectId, defaultFor: { id: projectId } },
      select: BRANCH_SELECT,
    });
  }

  async findByProjectAndName(
    projectId: string,
    name: string,
  ): Promise<BranchRow | null> {
    return this.client.branch.findUnique({
      where: { projectId_name: { projectId, name } },
      select: BRANCH_SELECT,
    });
  }

  async findById(id: string): Promise<BranchRow | null> {
    return this.client.branch.findUnique({
      where: { id },
      select: BRANCH_SELECT,
    });
  }

  async createDefault(projectId: string): Promise<BranchRow> {
    this.assertWritable();
    const branch = await this.client.branch.create({
      data: { projectId, name: DEFAULT_BRANCH_NAME },
      select: BRANCH_SELECT,
    });
    await this.client.project.update({
      where: { id: projectId },
      data: { defaultBranchId: branch.id },
    });
    return branch;
  }

  async create(
    projectId: string,
    name: string,
    targetBranchId: string | null,
  ): Promise<BranchRow> {
    this.assertWritable();
    return this.client.branch.create({
      data: { projectId, name, targetBranchId },
      select: BRANCH_SELECT,
    });
  }

  async setArchived(id: string, isArchived: boolean): Promise<void> {
    this.assertWritable();
    await this.client.branch.update({ where: { id }, data: { isArchived } });
  }

  async setTarget(id: string, targetBranchId: string | null): Promise<void> {
    this.assertWritable();
    await this.client.branch.update({
      where: { id },
      data: { targetBranchId },
    });
  }

  async setDefault(projectId: string, branchId: string): Promise<void> {
    this.assertWritable();
    await this.client.project.update({
      where: { id: projectId },
      data: { defaultBranchId: branchId },
    });
  }

  async list(
    projectId: string,
    includeArchived: boolean,
  ): Promise<BranchRow[]> {
    return this.client.branch.findMany({
      where: { projectId, ...(includeArchived ? {} : { isArchived: false }) },
      select: BRANCH_SELECT,
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    });
  }

  async deleteById(id: string): Promise<void> {
    this.assertWritable();
    await this.client.branch.delete({ where: { id } });
  }

  async findIdsByProjectId(projectId: string): Promise<string[]> {
    const rows = await this.client.branch.findMany({
      where: { projectId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
```

- [ ] **Step 4: Implement `BranchResolver`**

Create `backend/src/modules/public/visualTest/core/application/services/branch-resolver.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { DomainError } from "@common/domain/domain-error";
import { BranchRepository } from "@public/visualTest/core/infrastructure/repositories/branch.repository";
import { ProjectRepository } from "@public/visualTest/core/infrastructure/repositories/prisma-project.repository";

export interface ResolvedBranch {
  projectId: string;
  branchId: string;
  branchName: string;
  isDefault: boolean;
  isArchived: boolean;
}

@Injectable()
export class BranchResolver {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly branches: BranchRepository,
  ) {}

  async resolveRead(
    projectName: string,
    branchName?: string,
  ): Promise<ResolvedBranch> {
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, "NOT_FOUND");
    }
    const defaultBranch = await this.branches.findDefault(project.id);
    if (!defaultBranch) {
      throw new DomainError(
        `Project "${projectName}" has no default branch`,
        "NOT_FOUND",
      );
    }
    if (!branchName || branchName === defaultBranch.name) {
      return {
        projectId: project.id,
        branchId: defaultBranch.id,
        branchName: defaultBranch.name,
        isDefault: true,
        isArchived: defaultBranch.isArchived,
      };
    }
    const branch = await this.branches.findByProjectAndName(
      project.id,
      branchName,
    );
    if (!branch) {
      throw new DomainError(
        `Branch "${branchName}" not found in project "${projectName}"`,
        "NOT_FOUND",
      );
    }
    return {
      projectId: project.id,
      branchId: branch.id,
      branchName: branch.name,
      isDefault: false,
      isArchived: branch.isArchived,
    };
  }

  async findReadOrNull(
    projectName: string,
    branchName?: string,
  ): Promise<ResolvedBranch | null> {
    try {
      return await this.resolveRead(projectName, branchName);
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        return null;
      }
      throw error;
    }
  }

  async resolveForUpload(
    projectName: string,
    branchName?: string,
    targetBranchName?: string,
  ): Promise<ResolvedBranch> {
    const project = await this.projects.getOrCreate(projectName);
    let defaultBranch = await this.branches.findDefault(project.id);
    if (!defaultBranch) {
      defaultBranch = await this.branches.createDefault(project.id);
    }

    const name = branchName?.trim() || defaultBranch.name;
    if (name === defaultBranch.name) {
      return {
        projectId: project.id,
        branchId: defaultBranch.id,
        branchName: defaultBranch.name,
        isDefault: true,
        isArchived: defaultBranch.isArchived,
      };
    }

    const existing = await this.branches.findByProjectAndName(project.id, name);
    if (existing) {
      if (existing.isArchived) {
        throw new DomainError(
          `Branch "${name}" is archived — unarchive it before uploading`,
          "CONFLICT",
        );
      }
      return {
        projectId: project.id,
        branchId: existing.id,
        branchName: existing.name,
        isDefault: false,
        isArchived: false,
      };
    }

    let targetBranchId: string | null = null;
    if (targetBranchName && targetBranchName !== defaultBranch.name) {
      const target = await this.branches.findByProjectAndName(
        project.id,
        targetBranchName,
      );
      if (!target) {
        throw new DomainError(
          `Target branch "${targetBranchName}" not found`,
          "NOT_FOUND",
        );
      }
      if (target.isArchived) {
        throw new DomainError(
          `Target branch "${targetBranchName}" is archived`,
          "CONFLICT",
        );
      }
      targetBranchId = target.id;
    }

    const created = await this.branches.create(
      project.id,
      name,
      targetBranchId,
    );
    return {
      projectId: project.id,
      branchId: created.id,
      branchName: created.name,
      isDefault: false,
      isArchived: false,
    };
  }

  async assertValidTarget(
    projectId: string,
    branchId: string,
    targetBranchId: string,
  ): Promise<void> {
    if (branchId === targetBranchId) {
      throw new DomainError("A branch cannot target itself", "CONFLICT");
    }
    const target = await this.branches.findById(targetBranchId);
    if (!target || target.projectId !== projectId) {
      throw new DomainError("Target branch not found", "NOT_FOUND");
    }
    if (target.isArchived) {
      throw new DomainError("Target branch is archived", "CONFLICT");
    }

    let cursor: string | null = targetBranchId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === branchId) {
        throw new DomainError("Branch target creates a cycle", "CONFLICT");
      }
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const row = await this.branches.findById(cursor);
      cursor = row?.targetBranchId ?? null;
    }
  }
}
```

- [ ] **Step 5: Wire the providers**

In `visual-test-infra.module.ts`, import `BranchRepository`, add it to `providers` and `exports`.

In `visual-test-application.module.ts`, import `BranchResolver`, add it to `providers` and `exports`.

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/core/application/services/branch-resolver.service.spec.ts
pnpm --filter ./backend typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/public/visualTest/core backend/test/unit/modules/public/visualTest/core/application/services/branch-resolver.service.spec.ts
git commit -m "feat(branch): resolve and validate branches"
```

---

## Task 5: Upload accepts branch and targetBranch

**Files:**

- Modify: `backend/src/modules/public/visualTest/intake/application/upload-params.ts`
- Modify: `backend/src/modules/public/visualTest/intake/presentation/dto/upload.dto.ts`
- Modify: `backend/src/modules/public/visualTest/intake/presentation/controllers/upload.controller.ts`
- Modify: `backend/src/modules/public/visualTest/intake/application/upload-decision.resolver.ts`
- Modify: `backend/src/modules/public/visualTest/core/infrastructure/repositories/unified-test.repository.ts`
- Test: `backend/test/unit/modules/public/visualTest/intake/application/upload-decision.resolver.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `upload-decision.resolver.spec.ts`, add a mocked `BranchResolver` and replace the tests that assert project/test lookups:

```ts
import { BranchResolver } from "@public/visualTest/core/application/services/branch-resolver.service";
import { createMock } from "@test/utils/create-mock";

// inside beforeEach providers:
// { provide: BranchResolver, useValue: branches },
```

Add these cases:

```ts
it("resolves the default branch when no branch is given", async () => {
  branches.findReadOrNull.mockResolvedValue({
    projectId: "proj-1",
    branchId: "br-main",
    branchName: "main",
    isDefault: true,
    isArchived: false,
  });
  branches.resolveForUpload.mockResolvedValue({
    projectId: "proj-1",
    branchId: "br-main",
    branchName: "main",
    isDefault: true,
    isArchived: false,
  });
  tests.findByBranchAndTestName.mockResolvedValue(makeTest());
  screenshots.findBaselineByVariant.mockResolvedValue(
    makeBaseline({ imageHash: "same-hash" }),
  );

  await resolver.resolveIdentical(params, "same-hash");

  expect(branches.findReadOrNull).toHaveBeenCalledWith(
    "test-project",
    undefined,
  );
  expect(tests.findByBranchAndTestName).toHaveBeenCalledWith(
    "br-main",
    "test-name",
  );
});

it("returns null without writing when the branch does not exist yet", async () => {
  branches.findReadOrNull.mockResolvedValue(null);

  await expect(resolver.resolveIdentical(params, "hash")).resolves.toBeNull();
  expect(tests.findByBranchAndTestName).not.toHaveBeenCalled();
});

it("ensures the test on the resolved branch", async () => {
  branches.resolveForUpload.mockResolvedValue({
    projectId: "proj-1",
    branchId: "br-feature",
    branchName: "feature/x",
    isDefault: false,
  });
  tests.ensureTest.mockResolvedValue({ testId: "test-1" });
  screenshots.findBaselineByVariant.mockResolvedValue(null);

  await resolver.resolveStored(
    "image",
    { ...params, branch: "feature/x" },
    "hash",
  );

  expect(tests.ensureTest).toHaveBeenCalledWith(
    "br-feature",
    "proj-1",
    "test-name",
    "image",
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/intake/application/upload-decision.resolver.spec.ts
```

Expected: FAIL (missing branch methods).

- [ ] **Step 3: Extend `UploadParams`**

In `upload-params.ts`:

```ts
export interface UploadParams {
  projectName: string;
  testName: string;
  branch?: string;
  targetBranch?: string;
  viewport: string;
  browser: string;
  environment: string;
  file: Express.Multer.File;
}
```

- [ ] **Step 4: Add DTO fields**

In `upload.dto.ts`:

```ts
export class UploadDocumentDto extends VariantParamsDto {
  @ApiPropertyOptional({
    example: "feature/checkout-v2",
    description:
      "Branch that produced the upload (defaults to the project default branch)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BRANCH_NAME_LENGTH)
  branch?: string;

  @ApiPropertyOptional({
    example: "main",
    description:
      "Branch the new branch inherits from (defaults to the project default branch)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BRANCH_NAME_LENGTH)
  targetBranch?: string;
}
```

Add imports:

```ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { MAX_BRANCH_NAME_LENGTH } from "@public/visualTest/core/domain/constants/branch.constants";
```

- [ ] **Step 5: Pass the fields through the controller**

In `upload.controller.ts`, add `branch: body.branch`, `targetBranch: body.targetBranch` to the object passed to `uploadIntake.upload`.

- [ ] **Step 6: Make `ensureTest` branch-scoped**

In `unified-test.repository.ts`, replace `ensureTest`:

```ts
  async ensureTest(
    branchId: string,
    projectId: string,
    testName: string,
    kind: TestKind,
  ): Promise<{ testId: string }> {
    this.assertWritable();
    const test = await this.client.unifiedTest.upsert({
      where: { branchId_name: { branchId, name: testName } },
      create: { branchId, projectId, name: testName, kind },
      update: {},
    });

    if (test.kind !== kind) {
      throw new DomainError(
        `Test "${testName}" already exists as a ${test.kind} test and cannot be uploaded as a ${kind} test`,
        'CONFLICT',
      );
    }

    return { testId: test.id };
  }
```

Add:

```ts
  async findByBranchAndTestName(
    branchId: string,
    testName: string,
  ): Promise<{
    id: string;
    name: string;
    kind: TestKind;
    createdAt: Date;
  } | null> {
    return this.client.unifiedTest.findFirst({
      where: { name: testName, branchId },
      select: { id: true, name: true, kind: true, createdAt: true },
    });
  }
```

Keep `findByProjectNameAndTestName` for now (read paths still use it until Task 8).

- [ ] **Step 7: Resolve the branch in `UploadDecisionResolver`**

Replace the constructor and methods:

```ts
  constructor(
    private readonly tests: UnifiedTestRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly branches: BranchResolver,
  ) {}

  async resolveIdentical(
    params: UploadParams,
    fileHash: string,
  ): Promise<{ testId: string } | null> {
    const branch = await this.branches.findReadOrNull(
      params.projectName,
      params.branch,
    );
    if (!branch || branch.isArchived) return null;
    const test = await this.tests.findByBranchAndTestName(
      branch.branchId,
      params.testName,
    );
    if (!test) return null;
    // The gate is read-only: it must never create a branch, test, variant or
    // clone. A missing variant resolves to null and the stored path materializes
    // it inside the transaction.
    const baseline = await this.screenshots.findBaselineByVariant(
      test.id,
      toVariant(params),
    );
    const decision = decideOutcome(
      test.id,
      fileHash,
      baseline
        ? {
            id: baseline.id,
            contentHash: baseline.imageHash,
            fileUrl: baseline.imageUrl,
          }
        : null,
    );
    if (decision.status !== ComparisonOutcome.IDENTICAL) return null;
    return { testId: test.id };
  }

  async resolveStored(
    kind: TestKind,
    params: UploadParams,
    fileHash: string,
  ): Promise<UploadDecision> {
    const branch = await this.branches.resolveForUpload(
      params.projectName,
      params.branch,
      params.targetBranch,
    );
    const { testId } = await this.tests.ensureTest(
      branch.branchId,
      branch.projectId,
      params.testName,
      kind,
    );
    return this.resolveDecision(testId, branch.branchId, params, fileHash);
  }
```

Add import:

```ts
import { BranchResolver } from "@public/visualTest/core/application/services/branch-resolver.service";
```

- [ ] **Step 8: Update the old unit tests**

In `unified-test.repository.spec.ts`, replace the `ensureTest` expectations with the new signature:

```ts
const result = await repository.ensureTest(
  "br-1",
  "proj-1",
  "my-test",
  "image",
);

expect(mockClient.unifiedTest.upsert).toHaveBeenCalledWith({
  where: { branchId_name: { branchId: "br-1", name: "my-test" } },
  create: {
    branchId: "br-1",
    projectId: "proj-1",
    name: "my-test",
    kind: "image",
  },
  update: {},
});
```

Remove the `mockProjects.getOrCreate` assertion for `ensureTest` (project creation now happens in `BranchResolver`).

- [ ] **Step 9: Run the tests to verify they pass**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/intake/application/upload-decision.resolver.spec.ts test/unit/modules/public/visualTest/core/infrastructure/repositories/unified-test.repository.spec.ts
pnpm --filter ./backend typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/public/visualTest/intake backend/src/modules/public/visualTest/core/infrastructure/repositories/unified-test.repository.ts backend/test/unit
git commit -m "feat(branch): scope uploads to a branch"
```

---

## Task 6: Inherited baselines

**Files:**

- Create: `backend/src/modules/public/visualTest/core/application/services/branch-baseline-resolver.service.ts`
- Modify: `backend/src/modules/public/visualTest/core/infrastructure/repositories/variant-store.ts`
- Modify: `backend/src/modules/public/visualTest/core/infrastructure/repositories/unified-screenshot.repository.ts`
- Modify: `backend/src/modules/public/visualTest/intake/application/upload-decision.resolver.ts`
- Modify: `backend/src/modules/public/visualTest/core/visual-test-application.module.ts`
- Test: `backend/test/unit/modules/public/visualTest/core/application/services/branch-baseline-resolver.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `branch-baseline-resolver.service.spec.ts`:

```ts
import type { Mocked } from "vitest";
import { BranchBaselineResolver } from "@public/visualTest/core/application/services/branch-baseline-resolver.service";
import { BranchRepository } from "@public/visualTest/core/infrastructure/repositories/branch.repository";
import { UnifiedScreenshotRepository } from "@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository";
import { VariantStore } from "@public/visualTest/core/infrastructure/repositories/variant-store";
import { Variant } from "@public/visualTest/core/domain/value-objects/variant.vo";
import { createMock } from "@test/utils/create-mock";

describe("BranchBaselineResolver", () => {
  let resolver: BranchBaselineResolver;
  let variants: Mocked<VariantStore>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let branches: Mocked<BranchRepository>;
  const variant = Variant.fromStrings("1920x1080", "chromium", "staging");

  beforeEach(() => {
    variants = createMock<VariantStore>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    branches = createMock<BranchRepository>();
    resolver = new BranchBaselineResolver(variants, screenshots, branches);
  });

  it("uses a branch-owned baseline as-is", async () => {
    variants.findVariantWithBaseline.mockResolvedValue({
      baselineId: "base-1",
      isInherited: false,
      baseline: {
        id: "base-1",
        testId: "test-1",
        type: "BASELINE",
        imageHash: "h",
        imageUrl: "u",
        pageCount: null,
        pixelDiffThreshold: 0,
        createdAt: new Date(),
      },
    });

    const result = await resolver.resolveForVariant({
      testId: "test-1",
      branchId: "br-feature",
      variant,
    });

    expect(result).toMatchObject({ id: "base-1", imageHash: "h" });
    expect(screenshots.cloneInheritedBaseline).not.toHaveBeenCalled();
  });

  it("clones the nearest target baseline when the branch has none", async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    branches.findTargetChainIds.mockResolvedValue(["br-main"]);
    screenshots.findBaselineForBranch.mockResolvedValue({
      testId: "test-main",
      imageHash: "main-hash",
      imageUrl: "main-url",
      pageCount: 1,
      pixelDiffThreshold: 3,
    });
    screenshots.cloneInheritedBaseline.mockResolvedValue({
      id: "base-clone",
      imageHash: "main-hash",
      imageUrl: "main-url",
      pageCount: 1,
      pixelDiffThreshold: 3,
      createdAt: new Date(),
    });

    const result = await resolver.resolveForVariant({
      testId: "test-1",
      branchId: "br-feature",
      variant,
    });

    expect(screenshots.cloneInheritedBaseline).toHaveBeenCalledWith({
      testId: "test-1",
      source: {
        testId: "test-main",
        imageHash: "main-hash",
        imageUrl: "main-url",
        pageCount: 1,
        pixelDiffThreshold: 3,
      },
      variant,
    });
    expect(result).toMatchObject({ id: "base-clone" });
  });

  it("refreshes an inherited clone while preserving the branch threshold", async () => {
    variants.findVariantWithBaseline.mockResolvedValue({
      baselineId: "base-clone",
      isInherited: true,
      baseline: {
        id: "base-clone",
        testId: "test-1",
        type: "BASELINE",
        imageHash: "old",
        imageUrl: "old-url",
        pageCount: 1,
        pixelDiffThreshold: 7,
        createdAt: new Date(),
      },
    });
    branches.findTargetChainIds.mockResolvedValue(["br-main"]);
    screenshots.findBaselineForBranch.mockResolvedValue({
      testId: "test-main",
      imageHash: "new",
      imageUrl: "new-url",
      pageCount: 2,
      pixelDiffThreshold: 0,
    });
    screenshots.updateInheritedBaseline.mockResolvedValue({
      id: "base-clone",
      imageHash: "new",
      imageUrl: "new-url",
      pageCount: 2,
      pixelDiffThreshold: 7,
      createdAt: new Date(),
    });

    await resolver.resolveForVariant({
      testId: "test-1",
      branchId: "br-feature",
      variant,
    });

    expect(screenshots.updateInheritedBaseline).toHaveBeenCalledWith({
      baselineId: "base-clone",
      imageHash: "new",
      imageUrl: "new-url",
      pageCount: 2,
    });
  });

  it("pins the clone when the target baseline disappears", async () => {
    variants.findVariantWithBaseline.mockResolvedValue({
      baselineId: "base-clone",
      isInherited: true,
      baseline: {
        id: "base-clone",
        testId: "test-1",
        type: "BASELINE",
        imageHash: "old",
        imageUrl: "old-url",
        pageCount: 1,
        pixelDiffThreshold: 0,
        createdAt: new Date(),
      },
    });
    branches.findTargetChainIds.mockResolvedValue(["br-main"]);
    screenshots.findBaselineForBranch.mockResolvedValue(null);

    const result = await resolver.resolveForVariant({
      testId: "test-1",
      branchId: "br-feature",
      variant,
    });

    expect(screenshots.markBaselineOwned).toHaveBeenCalledWith("base-clone");
    expect(result).toMatchObject({ id: "base-clone" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/core/application/services/branch-baseline-resolver.service.spec.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Extend `VariantStore`**

In `variant-store.ts`, make `findVariantWithBaseline` return `isInherited`:

```ts
  async findVariantWithBaseline(
    testId: string,
    variant: Variant,
  ): Promise<{
    baselineId: string | null;
    isInherited: boolean;
    baseline: VariantBaselineRow | null;
  } | null> {
    const { viewport, browser, environment } = variant.toRecord();
    const v = await this.client.unifiedVariant.findUnique({
      where: {
        testId_viewport_browser_environment: {
          testId,
          viewport,
          browser,
          environment,
        },
      },
      include: { baseline: true },
    });
    if (!v) return null;
    return {
      baselineId: v.baselineId,
      isInherited: v.isInherited,
      baseline: v.baseline,
    };
  }
```

Add:

```ts
  async setInherited(variantId: string, isInherited: boolean): Promise<void> {
    this.assertWritable();
    await this.client.unifiedVariant.update({
      where: { id: variantId },
      data: { isInherited },
    });
  }
```

- [ ] **Step 4: Add screenshot helpers**

In `unified-screenshot.repository.ts`, add:

```ts
  async findBaselineForBranch(
    branchId: string,
    variant: Variant,
  ): Promise<{
    testId: string;
    imageHash: string;
    imageUrl: string;
    pageCount: number | null;
    pixelDiffThreshold: number;
  } | null> {
    const row = await this.client.unifiedVariant.findFirst({
      where: {
        test: { branchId },
        viewport: variant.viewport,
        browser: variant.browser,
        environment: variant.environment,
        isInherited: false,
        baselineId: { not: null },
      },
      include: { baseline: true },
      orderBy: { test: { createdAt: 'asc' } },
    });
    if (!row?.baseline) return null;
    return {
      testId: row.baseline.testId,
      imageHash: row.baseline.imageHash,
      imageUrl: row.baseline.imageUrl,
      pageCount: row.baseline.pageCount,
      pixelDiffThreshold: row.baseline.pixelDiffThreshold,
    };
  }

  async cloneInheritedBaseline(input: {
    testId: string;
    source: {
      testId: string;
      imageHash: string;
      imageUrl: string;
      pageCount: number | null;
      pixelDiffThreshold: number;
    };
    variant: Variant;
  }): Promise<VariantBaselineRow> {
    this.assertWritable();
    const variantId = await this.variants.ensureVariant(
      input.testId,
      input.variant,
    );
    const row = await this.client.unifiedScreenshot.upsert({
      where: {
        testId_variantId_type: {
          testId: input.testId,
          variantId,
          type: 'BASELINE',
        },
      },
      create: {
        testId: input.testId,
        variantId,
        type: 'BASELINE',
        imageHash: input.source.imageHash,
        imageUrl: input.source.imageUrl,
        pageCount: input.source.pageCount,
        pixelDiffThreshold: input.source.pixelDiffThreshold,
      },
      update: {
        imageHash: input.source.imageHash,
        imageUrl: input.source.imageUrl,
        pageCount: input.source.pageCount,
      },
    });
    await this.variants.setBaselineId(variantId, row.id);
    await this.variants.setInherited(variantId, true);
    return row;
  }

  async updateInheritedBaseline(input: {
    baselineId: string;
    imageHash: string;
    imageUrl: string;
    pageCount: number | null;
  }): Promise<VariantBaselineRow> {
    this.assertWritable();
    return this.client.unifiedScreenshot.update({
      where: { id: input.baselineId },
      data: {
        imageHash: input.imageHash,
        imageUrl: input.imageUrl,
        pageCount: input.pageCount,
      },
    });
  }

  async markBaselineOwned(baselineId: string): Promise<void> {
    this.assertWritable();
    await this.client.unifiedVariant.updateMany({
      where: { baselineId },
      data: { isInherited: false },
    });
  }
```

Add import for `VariantBaselineRow`:

```ts
import type { VariantBaselineRow } from "@public/visualTest/core/infrastructure/repositories/variant-store";
```

- [ ] **Step 5: Implement `BranchBaselineResolver`**

Create `branch-baseline-resolver.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { BranchRepository } from "@public/visualTest/core/infrastructure/repositories/branch.repository";
import { UnifiedScreenshotRepository } from "@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository";
import { VariantStore } from "@public/visualTest/core/infrastructure/repositories/variant-store";
import type { ScreenshotEntity } from "@public/visualTest/core/domain/entities/screenshot.entity";
import type { Variant } from "@public/visualTest/core/domain/value-objects/variant.vo";

@Injectable()
export class BranchBaselineResolver {
  constructor(
    private readonly variants: VariantStore,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly branches: BranchRepository,
  ) {}

  async resolveForVariant(input: {
    testId: string;
    branchId: string;
    variant: Variant;
  }): Promise<ScreenshotEntity | null> {
    const own = await this.variants.findVariantWithBaseline(
      input.testId,
      input.variant,
    );
    if (own?.baseline && !own.isInherited) {
      return toEntity(own.baseline, input.variant);
    }

    const chain = await this.branches.findTargetChainIds(input.branchId);
    const source = await this.findChainBaseline(chain, input.variant);

    if (own?.baseline && own.isInherited) {
      if (!source) {
        await this.screenshots.markBaselineOwned(own.baseline.id);
        return toEntity(own.baseline, input.variant);
      }
      const refreshed = await this.screenshots.updateInheritedBaseline({
        baselineId: own.baseline.id,
        imageHash: source.imageHash,
        imageUrl: source.imageUrl,
        pageCount: source.pageCount,
      });
      return toEntity(refreshed, input.variant);
    }

    if (!source) return null;
    const cloned = await this.screenshots.cloneInheritedBaseline({
      testId: input.testId,
      source,
      variant: input.variant,
    });
    return toEntity(cloned, input.variant);
  }

  private async findChainBaseline(
    branchIds: string[],
    variant: Variant,
  ): Promise<{
    testId: string;
    imageHash: string;
    imageUrl: string;
    pageCount: number | null;
    pixelDiffThreshold: number;
  } | null> {
    for (const branchId of branchIds) {
      const source = await this.screenshots.findBaselineForBranch(
        branchId,
        variant,
      );
      if (source) return source;
    }
    return null;
  }
}

function toEntity(
  row: {
    id: string;
    testId: string;
    type: string;
    imageHash: string;
    imageUrl: string;
    pageCount: number | null;
    pixelDiffThreshold: number;
    createdAt: Date;
  },
  variant: Variant,
): ScreenshotEntity {
  return new ScreenshotEntity({
    id: row.id,
    visualTestId: row.testId,
    type: "BASELINE",
    imageHash: row.imageHash,
    imageUrl: row.imageUrl,
    pageCount: row.pageCount ?? undefined,
    variant,
    createdAt: row.createdAt,
    pixelDiffThreshold: row.pixelDiffThreshold,
  });
}
```

Add `findTargetChainIds` to `BranchRepository`:

```ts
  async findTargetChainIds(branchId: string): Promise<string[]> {
    const chain: string[] = [];
    let cursor: string | null = branchId;
    const visited = new Set<string>();
    while (cursor) {
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const row = await this.findById(cursor);
      if (!row) break;
      if (row.targetBranchId) {
        chain.push(row.targetBranchId);
        cursor = row.targetBranchId;
        continue;
      }
      const defaultBranch = await this.findDefault(row.projectId);
      if (defaultBranch && defaultBranch.id !== row.id) {
        chain.push(defaultBranch.id);
      }
      break;
    }
    return chain;
  }
```

Note: the chain starts with the branch's targets, not the branch itself. `findBaselineForBranch` is only called on target branches, so an inherited clone is never sourced from itself.

- [ ] **Step 6: Use the resolver in the stored upload path**

In `upload-decision.resolver.ts`, replace `resolveDecision` (only `resolveStored`
calls it; the identical gate stays read-only):

```ts
  private async resolveDecision(
    testId: string,
    branchId: string,
    params: UploadParams,
    fileHash: string,
  ): Promise<UploadDecision> {
    const baseline = await this.baselines.resolveForVariant({
      testId,
      branchId,
      variant: toVariant(params),
    });
    return decideOutcome(
      testId,
      fileHash,
      baseline
        ? {
            id: baseline.id,
            contentHash: baseline.imageHash,
            fileUrl: baseline.imageUrl,
          }
        : null,
    );
  }
```

Add the constructor dependency:

```ts
    private readonly baselines: BranchBaselineResolver,
```

- [ ] **Step 7: Wire the provider**

Add `BranchBaselineResolver` to `providers` and `exports` in `visual-test-application.module.ts`.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/core/application/services/branch-baseline-resolver.service.spec.ts test/unit/modules/public/visualTest/intake/application/upload-decision.resolver.spec.ts
pnpm --filter ./backend typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/public/visualTest/core backend/src/modules/public/visualTest/intake backend/test/unit
git commit -m "feat(branch): inherit target baselines until first approval"
```

---

## Task 7: Approval pins the variant

**Files:**

- Modify: `backend/src/modules/public/visualTest/review/application/approval.service.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/application/approval.service.spec.ts`

- [ ] **Step 1: Write the failing test**

In `approval.service.spec.ts`, add an assertion to the image-approval success test after the baseline update:

```ts
expect(screenshots.updateBaselineScreenshot).toHaveBeenCalled();
expect(screenshots.markBaselineOwned).toHaveBeenCalledWith(expect.any(String));
```

If `screenshots` is created via `createMock`, `markBaselineOwned` exists automatically.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/approval.service.spec.ts
```

Expected: FAIL because `markBaselineOwned` is not called.

- [ ] **Step 3: Implement**

In `approval.service.ts`, inside `persist`, immediately after `updateBaselineScreenshot`:

```ts
await this.screenshots.markBaselineOwned(decision.baselineId);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/approval.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/public/visualTest/review/application/approval.service.ts backend/test/unit/modules/public/visualTest/review/application/approval.service.spec.ts
git commit -m "feat(branch): pin a variant when a branch approves"
```

---

## Task 8: Branch View and branch-scoped reads

**Files:**

- Create: `backend/src/modules/public/visualTest/core/infrastructure/repositories/branch-test.repository.ts`
- Modify: `backend/src/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.ts`
- Modify: `backend/src/modules/public/visualTest/review/infrastructure/repositories/test-read.repository.ts`
- Modify: `backend/src/modules/public/visualTest/review/application/test-query.service.ts`
- Modify: `backend/src/modules/public/visualTest/core/visual-test-infra.module.ts`
- Test: `backend/test/unit/modules/public/visualTest/core/infrastructure/repositories/branch-test.repository.spec.ts`

- [ ] **Step 1: Write the failing repository test**

Create `branch-test.repository.spec.ts`:

```ts
import type { Mocked } from "vitest";
import { BranchTestRepository } from "@public/visualTest/core/infrastructure/repositories/branch-test.repository";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { createMock } from "@test/utils/create-mock";

describe("BranchTestRepository", () => {
  let repository: BranchTestRepository;
  let connection: Mocked<PrismaConnection>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = { $queryRaw: vi.fn() };
    connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, "client", { get: () => mockClient });
    repository = new BranchTestRepository(connection);
  });

  it("maps effective test rows and marks the nearest ancestor as inherited", async () => {
    mockClient.$queryRaw.mockResolvedValue([
      {
        id: "test-1",
        name: "login",
        kind: "image",
        status: "UNCHANGED",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        branchId: "br-main",
        branchName: "main",
        isOwn: false,
      },
    ]);

    const result = await repository.findEffectiveTests("br-feature", {
      skip: 0,
      take: 50,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual({
      id: "test-1",
      name: "login",
      kind: "image",
      status: "UNCHANGED",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      origin: "inherited",
      inheritedFrom: "main",
    });
  });

  it("returns a single effective test", async () => {
    mockClient.$queryRaw.mockResolvedValue([
      {
        id: "test-2",
        name: "checkout",
        kind: "image",
        status: "PENDING",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        branchId: "br-feature",
        branchName: "feature/x",
        isOwn: true,
      },
    ]);

    const result = await repository.findEffectiveTest("br-feature", "checkout");

    expect(result).toMatchObject({
      id: "test-2",
      origin: "branch",
      inheritedFrom: null,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/core/infrastructure/repositories/branch-test.repository.spec.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `BranchTestRepository`**

Create `branch-test.repository.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { Prisma, TestKind, TestStatus } from "@/prisma/client";
import { DomainError } from "@common/domain/domain-error";

export interface EffectiveTest {
  id: string;
  name: string;
  kind: TestKind;
  status: TestStatus;
  createdAt: Date;
  origin: "branch" | "inherited";
  inheritedFrom: string | null;
}

interface EffectiveTestRow {
  id: string;
  name: string;
  kind: TestKind;
  status: TestStatus;
  createdAt: Date;
  branchId: string;
  branchName: string;
  isOwn: boolean;
  total?: bigint;
}

const CHAIN_CTE = (branchId: string) => Prisma.sql`
  WITH RECURSIVE chain AS (
    SELECT b."id", b."targetBranchId", b."projectId", 0 AS depth
    FROM "Branch" b
    WHERE b."id" = ${branchId}
    UNION ALL
    SELECT t."id", t."targetBranchId", c."projectId", c.depth + 1
    FROM "Branch" t
    JOIN chain c ON t."id" = COALESCE(
      c."targetBranchId",
      (SELECT p."defaultBranchId" FROM "Project" p WHERE p."id" = c."projectId")
    )
    WHERE t."id" <> c."id" AND c.depth < 10
  )
`;

@Injectable()
export class BranchTestRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  async findEffectiveTests(
    branchId: string,
    pagination?: { skip: number; take: number },
    kind?: TestKind,
  ): Promise<{ data: EffectiveTest[]; total: number }> {
    const kindFilter = kind ? Prisma.sql`AND t."kind" = ${kind}` : Prisma.empty;
    const rows = await this.client.$queryRaw<EffectiveTestRow[]>(Prisma.sql`
      ${CHAIN_CTE(branchId)}
      , ranked AS (
        SELECT t."id", t."name", t."kind", t."status", t."createdAt", t."branchId", c."depth",
               ROW_NUMBER() OVER (PARTITION BY t."name" ORDER BY c."depth" ASC) AS rn
        FROM "UnifiedTest" t
        JOIN chain c ON t."branchId" = c."id"
        ${kindFilter}
      )
      SELECT r."id", r."name", r."kind", r."status", r."createdAt",
             r."branchId", b."name" AS "branchName",
             (r."depth" = 0) AS "isOwn",
             COUNT(*) OVER() AS "total"
      FROM ranked r
      JOIN "Branch" b ON b."id" = r."branchId"
      WHERE r."rn" = 1
      ORDER BY r."name" ASC
      OFFSET ${pagination?.skip ?? 0} LIMIT ${pagination?.take ?? 1000}
    `);
    return {
      data: rows.map(toEffectiveTest),
      total: rows[0]?.total ? Number(rows[0].total) : 0,
    };
  }

  async findEffectiveTest(
    branchId: string,
    testName: string,
  ): Promise<EffectiveTest | null> {
    const rows = await this.client.$queryRaw<EffectiveTestRow[]>(Prisma.sql`
      ${CHAIN_CTE(branchId)}
      , ranked AS (
        SELECT t."id", t."name", t."kind", t."status", t."createdAt", t."branchId", c."depth",
               ROW_NUMBER() OVER (PARTITION BY t."name" ORDER BY c."depth" ASC) AS rn
        FROM "UnifiedTest" t
        JOIN chain c ON t."branchId" = c."id"
        WHERE t."name" = ${testName}
      )
      SELECT r."id", r."name", r."kind", r."status", r."createdAt",
             r."branchId", b."name" AS "branchName",
             (r."depth" = 0) AS "isOwn"
      FROM ranked r
      JOIN "Branch" b ON b."id" = r."branchId"
      WHERE r."rn" = 1
      LIMIT 1
    `);
    return rows[0] ? toEffectiveTest(rows[0]) : null;
  }

  async findOwnTest(
    branchId: string,
    testName: string,
  ): Promise<EffectiveTest | null> {
    const row = await this.client.unifiedTest.findFirst({
      where: { branchId, name: testName },
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        createdAt: true,
      },
    });
    return row ? { ...row, origin: "branch", inheritedFrom: null } : null;
  }

  async assertKindMatchesChain(
    branchId: string,
    testName: string,
    kind: TestKind,
  ): Promise<void> {
    const inherited = await this.findEffectiveTest(branchId, testName);
    if (
      inherited &&
      inherited.origin === "inherited" &&
      inherited.kind !== kind
    ) {
      throw new DomainError(
        `Test "${testName}" is a ${inherited.kind} test in the target branch and cannot be uploaded as a ${kind} test`,
        "CONFLICT",
      );
    }
  }
}

function toEffectiveTest(row: EffectiveTestRow): EffectiveTest {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt,
    origin: row.isOwn ? "branch" : "inherited",
    inheritedFrom: row.isOwn ? null : row.branchName,
  };
}
```

- [ ] **Step 4: Wire the provider**

Add `BranchTestRepository` to `providers` and `exports` in `visual-test-infra.module.ts`.

- [ ] **Step 5: Call the kind check during upload**

In `UploadDecisionResolver.resolveStored`, before `ensureTest`:

```ts
await this.branchTests.assertKindMatchesChain(
  branch.branchId,
  params.testName,
  kind,
);
```

Inject `BranchTestRepository` as `branchTests`.

- [ ] **Step 6: Make the project detail read branch-scoped**

In `ProjectReadRepository`:

- Inject `BranchResolver` and `BranchTestRepository`.
- Change `getWithLatestVariantStatuses(projectName, branchName?)`.
- Resolve the branch, fetch effective tests, and query variant signals by test ids:

```ts
  async getWithLatestVariantStatuses(
    projectName: string,
    branchName?: string,
  ): Promise<ProjectWithVariants | null> {
    const project = await this.client.project.findUnique({
      where: { name: projectName },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!project) return null;

    const branch = await this.branchResolver.resolveRead(projectName, branchName);
    const defaultBranch = await this.branchResolver.resolveRead(projectName);
    const effective = await this.branchTests.findEffectiveTests(branch.branchId);
    const testIds = effective.data.map((test) => test.id);
    const signalRows =
      testIds.length === 0
        ? []
        : await this.variants.findVariantStatusSignalsFor({
            testId: { in: testIds },
          });
    const variants = signalRows.map((row) => {
      const effectiveTest = effective.data.find(
        (test) => test.name === row.testName,
      );
      return {
        testName: row.testName,
        kind: row.testKind,
        viewport: row.viewport,
        browser: row.browser,
        environment: row.environment,
        status: resolveVariantStatusFromComparison(
          row.latestComparisonStatus ?? undefined,
          row.hasBaseline,
        ),
        origin: effectiveTest?.origin ?? 'branch',
        inheritedFrom: effectiveTest?.inheritedFrom ?? null,
      } satisfies ProjectVariantStatus;
    });

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      groupId: project.group?.id ?? null,
      groupName: project.group?.name ?? null,
      branchName: branch.branchName,
      defaultBranchName: defaultBranch.branchName,
      variants,
    };
  }
```

Extend `ProjectVariantStatus` with `origin` and `inheritedFrom`, and `ProjectWithVariants` with `branchName` + `defaultBranchName`.

- [ ] **Step 7: Expose origin through the read DTOs**

Add optional fields so the frontend can label inherited tests:

`ProjectDto` (in `project.dto.ts`):

```ts
  @ApiPropertyOptional({ example: 'feature/x' })
  @IsOptional()
  @IsString()
  @Expose()
  branchName?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  @Expose()
  defaultBranchName?: string;
```

`VisualTestDto` and `ProjectTestDto`:

```ts
  @ApiPropertyOptional({ enum: ['branch', 'inherited'] })
  @IsOptional()
  @IsString()
  @Expose()
  origin?: 'branch' | 'inherited';

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  inheritedFrom?: string | null;
```

`VisualTestDetailsDto` and `PdfTestDetailsDto`: add the same two optional fields.
`mapProjectDetailToDto` maps `branchName`, `defaultBranchName`, and per-variant
`origin`/`inheritedFrom`. `PdfTestDetailsMapper` maps `origin`/`inheritedFrom`
from `TestWithVariantsResult` (extend that result type).

- [ ] **Step 8: Make test reads branch-aware**

In `TestReadRepository`:

- Inject `BranchResolver` and `BranchTestRepository`.
- Replace `resolveVariantWithBaseline(projectName, testName, filters)` internals:

```ts
const branch = await this.branchResolver.resolveRead(projectName, branchName);
const effective = await this.branchTests.findEffectiveTest(
  branch.branchId,
  testName,
);
if (!effective) return null;
const test = {
  id: effective.id,
  name: effective.name,
  kind: effective.kind,
  createdAt: effective.createdAt,
};
const { variant, hasAnyVariant } = await this.variants.findReviewVariantRow(
  test.id,
  filters,
);
return {
  test,
  variant,
  origin: effective.origin,
  inheritedFrom: effective.inheritedFrom,
};
```

- Add `branchName?: string` as the fourth parameter of the public methods (`findVisualTestDetails`, `findTestWithVariants`, `findPdfDownloadSources`, `getTestNames`, `getPendingApproval`).
- `getTestNames(projectId, ...)` becomes `getTestNames(branchId, pagination, kind)` and returns effective tests:

```ts
  async getTestNames(
    branchId: string,
    pagination?: { skip: number; take: number },
    kind?: TestKind,
  ): Promise<{
    data: {
      name: string;
      kind: string;
      status: string | null;
      origin: 'branch' | 'inherited';
      inheritedFrom: string | null;
    }[];
    total: number;
  }> {
    const result = await this.branchTests.findEffectiveTests(
      branchId,
      pagination,
      kind,
    );
    return {
      data: result.data.map((test) => ({
        name: test.name,
        kind: test.kind,
        status: test.status,
        origin: test.origin,
        inheritedFrom: test.inheritedFrom,
      })),
      total: result.total,
    };
  }
```

- `getPendingApproval(projectId, ...)` becomes `getPendingApproval(branchId, ...)` with `where: { test: { branchId }, ...PENDING_APPROVAL_STATUS_FILTER }`.
- `findVisualTestDetails` and `findTestWithVariants` return `origin` and
  `inheritedFrom` from `resolveReadTarget`, so the detail DTOs and the PDF
  mapper can expose them. `TestQueryService.getVisualTestDetails` adds both
  fields to its response.

- [ ] **Step 9: Update `TestQueryService` and `ProjectService`**

`TestQueryService.getTestNames(projectName, pagination, kind, branchName?)`: resolve the branch via `BranchResolver` and call `testRead.getTestNames(branch.branchId, ...)`.

`TestQueryService.getTestsWithPendingStatus(projectName, pagination, branchName?)`: resolve the branch and call `getPendingApproval(branch.branchId, ...)`.

`TestQueryService.getVisualTestDetails` / `getPdfTestDetails`: pass `branchName` into `TestReadRepository` calls.

`ProjectService.getWithLatestVariantStatuses(projectName, branchName?)`: pass through.

- [ ] **Step 10: Add `branch` query params in the controllers**

In `tests-queries.controller.ts`, add `@Query('branch', new BranchNameValidationPipe()) branch?: string` to `getTestsForProject`, `getTestsWithPendingStatus`, `getKind`, and `getVisualTestDetails`, and pass it to the service.

In `projects.controller.ts`, add `@Query('branch', new BranchNameValidationPipe()) branch?: string` to `getOneProject`.

In `pdf.controller.ts`, add `@Query('branch', new BranchNameValidationPipe()) branch?: string` to `getPdfTestDetails`, `downloadPdf`, and `renderPdfPage` (render uses it only for ownership; pass it to `assertPdfBelongsToTest` in Task 11).

- [ ] **Step 11: Run tests and typecheck**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/core/infrastructure/repositories/branch-test.repository.spec.ts test/unit/modules/public/visualTest/review
pnpm --filter ./backend typecheck
```

Expected: PASS after updating the affected repository specs to the new signatures.

- [ ] **Step 12: Commit**

```bash
git add backend/src/modules/public/visualTest backend/test/unit
git commit -m "feat(branch): add branch view and scope project reads"
```

---

## Task 9: Inbox branch data

**Files:**

- Modify: `backend/src/modules/public/visualTest/review/infrastructure/repositories/review-inbox.repository.ts`
- Modify: `backend/src/modules/public/visualTest/review/application/review-inbox.service.ts`
- Modify: `backend/src/modules/public/visualTest/review/presentation/controllers/review-inbox.controller.ts`
- Modify: `backend/src/modules/public/visualTest/review/presentation/dto/review-responses.dto.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts`

- [ ] **Step 1: Write the failing test**

In `review-inbox.service.spec.ts`, add `branchName: 'feature/x'` and `isDefaultBranch: false` to the mocked row, and assert them on the result.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts
```

Expected: FAIL (fields missing from DTO).

- [ ] **Step 3: Implement**

In `review-inbox.repository.ts`:

- Add `branchName` and `isDefaultBranch` to `PendingReviewRow` and to the row mapping.
- Include `branch` in `INBOX_INCLUDE` via `test: { select: { name, kind, branch: { select: { name, id } }, project: {...} } }`.
- Add optional filters to `findPending`:

```ts
  async findPending(
    pagination?: { skip: number; take: number },
    filters?: { branchName?: string; projectName?: string },
  ): Promise<{ data: PendingReviewRow[]; total: number }> {
    const branchWhere: Prisma.BranchWhereInput = {};
    if (filters?.branchName) branchWhere.name = filters.branchName;
    else branchWhere.isArchived = false;
    if (filters?.projectName) branchWhere.project = { name: filters.projectName };
    const where: Prisma.UnifiedComparisonWhereInput = {
      ...PENDING_APPROVAL_STATUS_FILTER,
      ...(Object.keys(branchWhere).length > 0
        ? { test: { branch: branchWhere } }
        : {}),
    };
    // existing findManyWithCount call, using `where`
```

No branch filter means "all non-archived branches"; an explicit branch filter
may address an archived branch for history.

Row mapping:

```ts
          branchName: row.test.branch.name,
          isDefaultBranch:
            row.test.branch.id === row.test.project.defaultBranchId,
```

Add `defaultBranchId` to the project select. `INBOX_INCLUDE` becomes:

```ts
const INBOX_INCLUDE = {
  test: {
    select: {
      name: true,
      kind: true,
      branch: { select: { id: true, name: true } },
      project: {
        select: {
          name: true,
          defaultBranchId: true,
          group: { select: { id: true, name: true } },
        },
      },
    },
  },
  baseline: COMPARISON_INCLUDE.baseline,
} as const;
```

- [ ] **Step 4: Update service/controller/DTO**

`ReviewInboxService.getPending(pagination, filters)` passes filters to the repository.

`ReviewInboxController`:

```ts
  async getPending(
    @Query() pagination: PaginationDto,
    @Query('branch', new BranchNameValidationPipe()) branch?: string,
    @Query('projectName', new ProjectNameValidationPipe()) projectName?: string,
  ) {
    return this.inbox.getPending(pagination, {
      branchName: branch,
      projectName,
    });
  }
```

But `ProjectNameValidationPipe` rejects `undefined`? It calls `validateName(undefined)` → crash. Use a separate optional check:

```ts
const filters = {
  branchName: branch,
  projectName: projectName && projectName !== "" ? projectName : undefined,
};
```

Wrap the project name with `new ProjectNameValidationPipe()` only when present via a small helper, or validate inside. Simpler: add `@Query('projectName') projectName?: string` and validate with `validateName` only if non-empty:

```ts
import { validateName, PROJECT_RESERVED_NAMES } from '@common/http/pipes/name-validation.util';
...
if (projectName) validateName(projectName, PROJECT_RESERVED_NAMES);
```

Add to `PendingReviewDto`:

```ts
  @ApiProperty()
  @IsString()
  @Expose()
  branchName!: string;

  @ApiProperty()
  @IsBoolean()
  @Expose()
  isDefaultBranch!: boolean;
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts
pnpm --filter ./backend typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/public/visualTest/review backend/test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts
git commit -m "feat(branch): expose branch on inbox rows"
```

---

## Task 10: Branch lifecycle commands

**Files:**

- Create: `backend/src/modules/public/visualTest/review/application/branch-command.service.ts`
- Create: `backend/src/modules/public/visualTest/review/infrastructure/repositories/branch-read.repository.ts`
- Create: `backend/src/modules/public/visualTest/review/presentation/controllers/branches.controller.ts`
- Create: `backend/src/modules/public/visualTest/review/presentation/dto/branch.dto.ts`
- Modify: `backend/src/modules/public/visualTest/review/review.module.ts`
- Modify: `backend/src/modules/public/visualTest/core/application/services/test-deletion.service.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/application/branch-command.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `branch-command.service.spec.ts` with these cases:

```ts
it("refuses to delete the default branch", async () => {
  branchResolver.resolveRead.mockResolvedValue({
    projectId: "proj-1",
    branchId: "br-main",
    branchName: "main",
    isDefault: true,
  });

  await expect(service.delete("app", "main")).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

it("archives a feature branch", async () => {
  branches.findByProjectAndName.mockResolvedValue({
    id: "br-1",
    projectId: "proj-1",
    name: "feature/x",
    targetBranchId: null,
    isArchived: false,
    createdAt: new Date(),
  });
  branches.findDefault.mockResolvedValue({
    id: "br-main",
    projectId: "proj-1",
    name: "main",
    targetBranchId: null,
    isArchived: false,
    createdAt: new Date(),
  });

  await service.setArchived("app", "feature/x", true);

  expect(branches.setArchived).toHaveBeenCalledWith("br-1", true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/branch-command.service.spec.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `BranchCommandService`**

```ts
import { Injectable } from "@nestjs/common";
import { DomainError } from "@common/domain/domain-error";
import { BranchRepository } from "@public/visualTest/core/infrastructure/repositories/branch.repository";
import { BranchResolver } from "@public/visualTest/core/application/services/branch-resolver.service";
import { BranchDeletionService } from "@public/visualTest/core/application/services/branch-deletion.service";
import { ProjectRepository } from "@public/visualTest/core/infrastructure/repositories/prisma-project.repository";
import { StateChangeWorkflow } from "@public/visualTest/core/application/services/state-change-workflow.service";
import { noop } from "@public/visualTest/core/application/services/state-change-options";

@Injectable()
export class BranchCommandService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly branches: BranchRepository,
    private readonly resolver: BranchResolver,
    private readonly deletion: BranchDeletionService,
    private readonly workflow: StateChangeWorkflow,
  ) {}

  async setArchived(
    projectName: string,
    branchName: string,
    isArchived: boolean,
  ): Promise<void> {
    const branch = await this.resolveFeatureBranch(projectName, branchName);
    await this.workflow.executeStateChange(async () => {
      await this.branches.setArchived(branch.id, isArchived);
      return noop();
    });
  }

  async setTarget(
    projectName: string,
    branchName: string,
    targetBranchName: string | null,
  ): Promise<void> {
    const project = await this.resolveProject(projectName);
    const branch = await this.resolveFeatureBranch(projectName, branchName);
    if (!targetBranchName) {
      await this.writeTarget(branch.id, null);
      return;
    }
    const defaultBranch = await this.branches.findDefault(project.id);
    if (targetBranchName === defaultBranch?.name) {
      await this.writeTarget(branch.id, null);
      return;
    }
    const target = await this.branches.findByProjectAndName(
      project.id,
      targetBranchName,
    );
    if (!target) {
      throw new DomainError(
        `Target branch "${targetBranchName}" not found`,
        "NOT_FOUND",
      );
    }
    await this.resolver.assertValidTarget(project.id, branch.id, target.id);
    await this.writeTarget(branch.id, target.id);
  }

  async setDefault(projectName: string, branchName: string): Promise<void> {
    const project = await this.resolveProject(projectName);
    const branch = await this.branches.findByProjectAndName(
      project.id,
      branchName,
    );
    if (!branch) {
      throw new DomainError(`Branch "${branchName}" not found`, "NOT_FOUND");
    }
    if (branch.isArchived) {
      throw new DomainError(
        "An archived branch cannot be the default",
        "CONFLICT",
      );
    }
    await this.workflow.executeStateChange(async () => {
      await this.branches.setTarget(branch.id, null);
      await this.branches.setDefault(project.id, branch.id);
      await this.branches.markAllOwned(branch.id);
      return noop();
    });
  }

  async delete(projectName: string, branchName: string): Promise<void> {
    const branch = await this.resolveFeatureBranch(projectName, branchName);
    await this.deletion.delete(branch.projectId, branch.id);
  }

  private async writeTarget(
    branchId: string,
    targetBranchId: string | null,
  ): Promise<void> {
    await this.workflow.executeStateChange(async () => {
      await this.branches.setTarget(branchId, targetBranchId);
      return noop();
    });
  }

  private async resolveProject(projectName: string) {
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, "NOT_FOUND");
    }
    return project;
  }

  private async resolveFeatureBranch(projectName: string, branchName: string) {
    const resolved = await this.resolver.resolveRead(projectName, branchName);
    if (resolved.isDefault) {
      throw new DomainError(
        "The default branch cannot be modified this way",
        "CONFLICT",
      );
    }
    const branch = await this.branches.findByProjectAndName(
      resolved.projectId,
      branchName,
    );
    if (!branch) {
      throw new DomainError(`Branch "${branchName}" not found`, "NOT_FOUND");
    }
    return branch;
  }
}
```

Add `markAllOwned` to `BranchRepository`:

```ts
  async markAllOwned(branchId: string): Promise<void> {
    this.assertWritable();
    await this.client.unifiedVariant.updateMany({
      where: { test: { branchId } },
      data: { isInherited: false },
    });
  }
```

- [ ] **Step 4: Implement `BranchDeletionService`**

Create `backend/src/modules/public/visualTest/core/application/services/branch-deletion.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { StateChangeWorkflow } from "@public/visualTest/core/application/services/state-change-workflow.service";
import { deleted } from "@public/visualTest/core/application/services/state-change-options";
import { UnifiedTestRepository } from "@public/visualTest/core/infrastructure/repositories/unified-test.repository";
import { UnifiedScreenshotRepository } from "@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository";
import { UnifiedComparisonsRepository } from "@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository";
import { BranchRepository } from "@public/visualTest/core/infrastructure/repositories/branch.repository";
import { JOB_PRODUCER, IJobProducer } from "@common/domain/job-queue.interface";
import { DELETION_STATE_CHANGE_RETRY } from "@public/visualTest/core/application/services/state-change-options";
import { DomainError } from "@common/domain/domain-error";

@Injectable()
export class BranchDeletionService {
  constructor(
    private readonly branches: BranchRepository,
    private readonly tests: UnifiedTestRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
    @Inject(JOB_PRODUCER) private readonly jobQueue: IJobProducer,
    private readonly workflow: StateChangeWorkflow,
  ) {}

  async delete(projectId: string, branchId: string): Promise<void> {
    await this.workflow.executeStateChange(
      async () => {
        const branch = await this.branches.findById(branchId);
        if (!branch || branch.projectId !== projectId) {
          throw new DomainError("Branch not found", "NOT_FOUND");
        }
        const defaultBranch = await this.branches.findDefault(branch.projectId);
        if (defaultBranch?.id === branch.id) {
          throw new DomainError(
            "The default branch cannot be deleted",
            "CONFLICT",
          );
        }
        const testIds = await this.tests.findIdsByBranchId(branchId);
        if (testIds.length > 0) {
          await this.jobQueue.cancelByTestIds(testIds);
        }
        const screenshotUrls =
          testIds.length > 0
            ? await this.screenshots.findAllImageUrlsForTests(testIds)
            : [];
        const diffUrls =
          testIds.length > 0
            ? await this.comparisons.findDiffImageUrlsByTestIds(testIds)
            : [];
        await this.branches.deleteById(branchId);
        // Inherited baseline clones share their file with the target branch.
        // Reclaim only URLs that no surviving screenshot/comparison references.
        const staleUrls = await this.screenshots.filterReclaimableUrls([
          ...screenshotUrls,
          ...diffUrls,
        ]);
        return deleted({ staleUrls });
      },
      { retry: DELETION_STATE_CHANGE_RETRY },
    );
  }
}
```

Add to `UnifiedTestRepository`:

```ts
  async findIdsByBranchId(branchId: string): Promise<string[]> {
    const tests = await this.client.unifiedTest.findMany({
      where: { branchId },
      select: { id: true },
    });
    return tests.map((test) => test.id);
  }
```

- [ ] **Step 5: Implement the read repository and controller**

`BranchReadRepository`:

```ts
@Injectable()
export class BranchReadRepository {
  constructor(
    private readonly connection: PrismaConnection,
    private readonly branchResolver: BranchResolver,
  ) {}

  async list(projectName: string, includeArchived: boolean) {
    const defaultBranch = await this.branchResolver.resolveRead(projectName);
    const branches = await this.connection.client.branch.findMany({
      where: {
        projectId: defaultBranch.projectId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: {
        targetBranch: { select: { name: true } },
        _count: { select: { tests: true } },
      },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    });
    const counts = await this.pendingCounts(defaultBranch.projectId);
    return branches.map((branch) => ({
      name: branch.name,
      isDefault: branch.id === defaultBranch.branchId,
      isArchived: branch.isArchived,
      targetBranchName:
        branch.id === defaultBranch.branchId
          ? null
          : (branch.targetBranch?.name ?? defaultBranch.branchName),
      testCount: branch._count.tests,
      pendingCount: counts.get(branch.id) ?? 0,
      createdAt: branch.createdAt,
    }));
  }

  private async pendingCounts(projectId: string): Promise<Map<string, number>> {
    const rows = await this.connection.client.$queryRaw<
      { branchId: string; pendingCount: bigint }[]
    >`
      SELECT t."branchId", COUNT(c.id) AS "pendingCount"
      FROM "UnifiedComparison" c
      JOIN "UnifiedTest" t ON c."testId" = t.id
      JOIN "Branch" b ON t."branchId" = b.id
      WHERE c.status = 'PENDING_APPROVAL' AND b."projectId" = ${projectId}
      GROUP BY t."branchId"
    `;
    return new Map(rows.map((row) => [row.branchId, Number(row.pendingCount)]));
  }
}
```

`branches.controller.ts`:

```ts
@ApiTags("Branches")
@Controller("projects/:projectName/branches")
export class BranchesController {
  constructor(
    private readonly read: BranchReadRepository,
    private readonly commands: BranchCommandService,
  ) {}

  @Get()
  list(
    @Param("projectName", ProjectNameValidationPipe) projectName: string,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return this.read.list(projectName, includeArchived === "true");
  }

  @Patch()
  update(
    @Param("projectName", ProjectNameValidationPipe) projectName: string,
    @Query("branch", new BranchNameValidationPipe()) branch: string,
    @Body() body: UpdateBranchDto,
  ) {
    return this.commands.apply(projectName, branch, body);
  }

  @Delete()
  remove(
    @Param("projectName", ProjectNameValidationPipe) projectName: string,
    @Query("branch", new BranchNameValidationPipe()) branch: string,
  ) {
    return this.commands.delete(projectName, branch);
  }
}
```

`UpdateBranchDto`:

```ts
export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BRANCH_NAME_LENGTH)
  targetBranch?: string | null;
}
```

`BranchCommandService.apply(projectName, branchName, body)`:

```ts
  async apply(projectName: string, branchName: string, body: UpdateBranchDto) {
    if (body.isArchived !== undefined) {
      await this.setArchived(projectName, branchName, body.isArchived);
    }
    if (body.targetBranch !== undefined) {
      await this.setTarget(projectName, branchName, body.targetBranch);
    }
    return { success: true };
  }
```

Extend `UpdateProjectDto` with:

```ts
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BRANCH_NAME_LENGTH)
  defaultBranchName?: string;
```

In `ProjectService`, inject `BranchCommandService` and handle it in
`updateProjectGroup` before loading the updated summary:

```ts
if (dto.defaultBranchName !== undefined) {
  await this.branchCommands.setDefault(projectName, dto.defaultBranchName);
}
```

`ProjectService.updateProjectGroup` currently takes `(projectName, groupId)`.
Change its signature to accept the DTO:

```ts
  async updateProjectGroup(
    projectName: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
```

Keep the existing `groupId` handling (`dto.groupId`), and add the
`defaultBranchName` branch above. Update `ProjectsController.updateProject` to
pass `dto` instead of `dto.groupId`.

- [ ] **Step 6: Update project deletion**

`TestDeletionService.deleteProject` currently uses `tests.findIdsByProjectId(project.id)`. With `projectId` still present, this keeps working in this task; Task 16 rewrites it to a branch join. No change needed now.

- [ ] **Step 7: Wire the module**

In `review.module.ts`, add `BranchesController`, `BranchReadRepository`, `BranchCommandService` and import `BranchDeletionService` from the application module providers (export it in `visual-test-application.module.ts`).

- [ ] **Step 8: Run tests and typecheck**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/branch-command.service.spec.ts
pnpm --filter ./backend typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/public/visualTest backend/test/unit
git commit -m "feat(branch): add branch lifecycle commands"
```

---

## Task 11: Branch plumbing for test commands, approvals and PDF

**Files:**

- Modify: `backend/src/modules/public/visualTest/core/application/services/test-resolver.service.ts`
- Modify: `backend/src/modules/public/visualTest/review/application/test-command.service.ts`
- Modify: `backend/src/modules/public/visualTest/review/presentation/controllers/test-commands.controller.ts`
- Modify: `backend/src/modules/public/visualTest/review/application/approval.service.ts`
- Modify: `backend/src/modules/public/visualTest/review/presentation/controllers/approvals.controller.ts`
- Modify: `backend/src/modules/public/visualTest/review/application/pdf-access.service.ts`
- Modify: `backend/src/modules/public/visualTest/review/presentation/controllers/pdf.controller.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/application/test-command.service.spec.ts`

- [ ] **Step 1: Write the failing test**

In `test-command.service.spec.ts`, add:

```ts
it("rejects deleting an inherited test from a feature branch", async () => {
  testResolver.findOwnTest.mockResolvedValue(null);
  testResolver.findTest.mockResolvedValue({
    id: "test-main",
    name: "login",
    kind: "image",
    origin: "inherited",
  });

  await expect(
    service.deleteTest("app", "login", "feature/x"),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/test-command.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Extend `TestResolver`**

Add `BranchResolver` and `BranchTestRepository` dependencies. Change:

```ts
  async findTest(
    projectName: string,
    testName: string,
    branchName?: string,
  ): Promise<{ id: string; name: string; kind: TestKind; origin: 'branch' | 'inherited' }> {
    const branch = await this.branches.resolveRead(projectName, branchName);
    const test = await this.branchTests.findEffectiveTest(branch.branchId, testName);
    if (!test) {
      throw new DomainError(`Test "${testName}" not found`, 'NOT_FOUND');
    }
    return {
      id: test.id,
      name: test.name,
      kind: test.kind,
      origin: test.origin,
    };
  }

  async findOwnTest(
    projectName: string,
    testName: string,
    branchName?: string,
  ): Promise<{ id: string; name: string; kind: TestKind }> {
    const branch = await this.branches.resolveRead(projectName, branchName);
    const test = await this.branchTests.findOwnTest(branch.branchId, testName);
    if (!test) {
      const inherited = await this.branchTests.findEffectiveTest(
        branch.branchId,
        testName,
      );
      if (inherited) {
        throw new DomainError(
          `Test "${testName}" is inherited from branch "${inherited.inheritedFrom}" and cannot be modified here`,
          'CONFLICT',
        );
      }
      throw new DomainError(`Test "${testName}" not found`, 'NOT_FOUND');
    }
    return { id: test.id, name: test.name, kind: test.kind };
  }

  async findTestOfKind(
    projectName: string,
    testName: string,
    kind: TestKind,
    branchName?: string,
  ): Promise<{ id: string; name: string; kind: TestKind }> {
    const test = await this.findOwnTest(projectName, testName, branchName);
    this.assertTestKind(test, kind);
    return test;
  }
```

Keep `resolveProject`.

- [ ] **Step 4: Update test commands**

`TestCommandService.deleteTest(projectName, testName, branchName?, filters?)` uses `findOwnTest` and the new parameter order. Keep the existing `filters` as the fourth parameter, matching the controller.

`TestCommandService.updateThreshold(testName, projectName, threshold, filters?, preview?, branchName?)` uses `findOwnTest` + `assertTestKind` manually, or `findTestOfKind(..., branchName)`.

Controller: add `branch` to `VariantFilterDto`? No — branch is not a variant. Add `@Query('branch', new BranchNameValidationPipe()) branch?: string` to both methods and pass it through. For `deleteVisualTest`, pass `filters` and `branch`.

- [ ] **Step 5: Update approval**

`ApprovalService.approveImage/approvePdf` accept `branchName?: string` and pass it to `testResolver.findTestOfKind(..., branchName)`.

Controller: add `@Query('branch', new BranchNameValidationPipe()) branch?: string` and forward it.

- [ ] **Step 6: Update PDF access**

`PdfAccessService.download` and `renderPdfPage` accept `branchName?: string` and pass it to `TestReadRepository` (`findPdfDownloadSources(..., branchName)` and `assertPdfBelongsToTest(..., branchName)`).

`assertPdfBelongsToTest(projectName, testName, imageUrl, branchName?)` scopes the count by the effective test id:

```ts
const branch = await this.branchResolver.resolveRead(projectName, branchName);
const test = await this.branchTests.findEffectiveTest(
  branch.branchId,
  testName,
);
if (!test) throw new DomainError("Test not found", "NOT_FOUND");
const screenshotCount = await this.client.unifiedScreenshot.count({
  where: { imageUrl, testId: test.id },
});
```

- [ ] **Step 7: Run tests and typecheck**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review
pnpm --filter ./backend typecheck
```

Expected: PASS after updating mocks for the new resolver methods.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/public/visualTest backend/test/unit
git commit -m "feat(branch): branch-scope commands, approvals and PDF access"
```

---

## Task 12: Regenerate the SDK

**Files:**

- Regenerate: `backend/swagger.json`, `client-sdk/**`
- Modify: `frontend/src/**` call sites that now require the branch argument (optional fields only; TypeScript will tell you)

- [ ] **Step 1: Generate and build**

```bash
pnpm run sdk:generate
pnpm run sdk:build
```

Expected: `client-sdk/sdk.gen.ts` exposes `branchesControllerList`, `branchesControllerUpdate`, `branchesControllerRemove`; `UploadControllerUploadData` body has `branch`/`targetBranch`; read queries have `branch`; `PendingReviewDto` has `branchName`/`isDefaultBranch`.

- [ ] **Step 2: Fix frontend type errors caused by new optional params**

Run:

```bash
pnpm run typecheck:all
```

Expected: PASS. If a generated name differs (e.g. `branchesControllerList`), use the generated name from `client-sdk/sdk.gen.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/swagger.json client-sdk frontend/src
git commit -m "chore(sdk): regenerate for branch support"
```

---

## Task 13: Frontend branches domain and project switcher

**Files:**

- Create: `frontend/src/domains/branches/branch.model.ts`
- Create: `frontend/src/domains/branches/branch.mapper.ts`
- Create: `frontend/src/domains/branches/query-keys.ts`
- Create: `frontend/src/composables/useBranches.ts`
- Modify: `frontend/src/composables/useProjects.ts`
- Modify: `frontend/src/domains/projects/project.model.ts`
- Modify: `frontend/src/domains/projects/project.mapper.ts`
- Modify: `frontend/src/composables/useProjectDetailPage.ts`
- Modify: `frontend/src/views/ProjectDetailView.vue`
- Test: `frontend/src/domains/branches/__tests__/branch.mapper.spec.ts`
- Test: `frontend/src/domains/projects/__tests__/project.mapper.spec.ts`

- [ ] **Step 1: Write the failing mapper test**

Create `frontend/src/domains/branches/__tests__/branch.mapper.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapBranch, mapBranches } from "../branch.mapper";

describe("branch mapper", () => {
  it("maps branch DTOs", () => {
    expect(
      mapBranch({
        name: "feature/x",
        isDefault: false,
        isArchived: false,
        targetBranchName: "main",
        testCount: 3,
        pendingCount: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      } as never),
    ).toEqual({
      name: "feature/x",
      isDefault: false,
      isArchived: false,
      targetBranchName: "main",
      testCount: 3,
      pendingCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(mapBranches()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test -- --run src/domains/branches/__tests__/branch.mapper.spec.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the domain**

`branch.model.ts`:

```ts
export interface ProjectBranch {
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  targetBranchName: string | null;
  testCount: number;
  pendingCount: number;
  createdAt: string;
}
```

`branch.mapper.ts`:

```ts
import type { BranchDto } from "@sdk";
import type { ProjectBranch } from "./branch.model";

export function mapBranch(dto: BranchDto): ProjectBranch {
  return {
    name: dto.name,
    isDefault: dto.isDefault,
    isArchived: dto.isArchived,
    targetBranchName: dto.targetBranchName ?? null,
    testCount: dto.testCount,
    pendingCount: dto.pendingCount,
    createdAt: dto.createdAt,
  };
}

export function mapBranches(dtos: BranchDto[] = []): ProjectBranch[] {
  return dtos.map(mapBranch);
}
```

`query-keys.ts`:

```ts
export const branchQueryKeys = {
  all: () => ["branches"] as const,
  list: (projectName: string, includeArchived: boolean) =>
    [...branchQueryKeys.all(), projectName, includeArchived] as const,
} as const;
```

- [ ] **Step 4: Add the query composable**

Create `useBranches.ts`:

```ts
import { computed, unref } from "vue";
import { branchesControllerList, type BranchDto } from "@sdk";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { branchQueryKeys } from "@/domains/branches/query-keys";
import { mapBranches } from "@/domains/branches/branch.mapper";
import type { ProjectBranch } from "@/domains/branches/branch.model";

export function useBranchesQuery(
  projectName: MaybeRef<string | undefined>,
  includeArchived = false,
) {
  return useSdkQuery({
    args: { projectName },
    required: ["projectName"],
    keyOf: ({ projectName }) =>
      branchQueryKeys.list(projectName, includeArchived),
    sdkFn: ({ projectName }) =>
      branchesControllerList({
        path: { projectName },
        query: { includeArchived: includeArchived ? "true" : undefined },
      }),
    map: (data: BranchDto[] | undefined) => mapBranches(data),
  });
}
```

- [ ] **Step 5: Make project queries branch-aware**

In `project.model.ts`, add `branchName?: string; defaultBranchName?: string;` to `Project` and `origin?: "branch" | "inherited"; inheritedFrom?: string | null;` to `VisualTestItem`.

In `project.mapper.ts`, map `origin` and `inheritedFrom` from the DTO, and `branchName`/`defaultBranchName` from `ProjectDto`.

In `useProjects.ts`:

```ts
export function useProjectDetailQuery(
  projectName: MaybeRef<string | undefined>,
  branchName?: MaybeRef<string | undefined>,
) {
  const branchRef = computed(() => unref(branchName));
  return useSdkQuery({
    args: { projectName, branchName: branchRef },
    required: ["projectName"],
    keyOf: ({ projectName }) => [
      ...projectQueryKeys.detail(projectName),
      branchRef.value ?? "",
    ],
    sdkFn: ({ projectName }) =>
      projectsControllerGetOneProject({
        path: { projectName },
        query: branchRef.value ? { branch: branchRef.value } : {},
      }),
    map: (data: ProjectDto | undefined) => {
      if (!data) throw new Error("Project not found");
      return mapProject(data);
    },
  });
}
```

In `useProjectDetailPage.ts`, accept `branchName` and pass it to the query; default the selected branch:

```ts
export function useProjectDetailPage(
  projectName: MaybeRef<string | undefined>,
  branchName: MaybeRef<string | undefined>,
) {
  const projectQuery = useProjectDetailQuery(projectName, branchName);
  ...
}
```

- [ ] **Step 6: Add the switcher to `ProjectDetailView.vue`**

Use `useRoute`/`useRouter` (or extend `useRouteParams`). Add a `Select` bound to the selected branch. On change:

```ts
function selectBranch(name: string) {
  void router.replace({
    query: { ...route.query, branch: name },
  });
}
```

`selectedBranch` is `route.query.branch` or `project.value?.branchName` or `project.value?.defaultBranchName`. Fetch `useBranchesQuery(projectName)` and render one `SelectItem` per non-archived branch (+ archived when explicitly selected).

Update `useProjectDetailPage(projectName, selectedBranch)`.

- [ ] **Step 7: Add the inherited badge and disable actions**

In `frontend/src/components/tables/VisualTestsTable.vue` and
`frontend/src/components/tables/RowActionsCell.vue`:

- `VisualTestsTable.vue` renders a `Badge` with
  `inherited from {{ test.inheritedFrom }}` when `test.origin === "inherited"`.
- Add a `readOnly?: boolean` prop to `RowActionsCell.vue`; when `true`, render
  neither the delete nor the threshold action.
- Pass `:read-only="test.origin === 'inherited'"` from `VisualTestsTable.vue`.

- [ ] **Step 8: Add mapper tests**

Add to `project.mapper.spec.ts`:

```ts
it("maps inherited test metadata", () => {
  const project = mapProject({
    name: "app",
    branchName: "feature/x",
    defaultBranchName: "main",
    visualTests: [
      {
        name: "login",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "chromium",
          environment: "staging",
        },
        latestStatus: "UNCHANGED",
        origin: "inherited",
        inheritedFrom: "main",
      },
    ],
  } as never);

  expect(project.branchName).toBe("feature/x");
  expect(project.visualTests?.[0].origin).toBe("inherited");
});
```

- [ ] **Step 9: Run tests and typecheck**

```bash
pnpm --filter ./frontend test -- --run src/domains/branches/__tests__/branch.mapper.spec.ts src/domains/projects/__tests__
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src
git commit -m "feat(branch): add branch switcher and inherited test badges"
```

---

## Task 14: Inbox badge/filter and review-loop branch propagation

**Files:**

- Modify: `frontend/src/domains/pending-tests/review-inbox.model.ts`
- Modify: `frontend/src/domains/pending-tests/review-inbox.mapper.ts`
- Modify: `frontend/src/views/InboxView.vue`
- Modify: `frontend/src/components/inbox/InboxProjectSection.vue`
- Modify: `frontend/src/components/tables/VisualTestsTable.vue`
- Modify: `frontend/src/__tests__/useTestNavigation.test.ts`
- Modify: `frontend/src/composables/usePendingTests.ts`
- Modify: `frontend/src/composables/useTestDetailsPage.ts`
- Modify: `frontend/src/composables/useTestNavigation.ts`
- Modify: `frontend/src/composables/useReviewSession.ts`
- Modify: `frontend/src/composables/useRouteParams.ts`
- Modify: `frontend/src/views/VisualTestDetailsView.vue`
- Modify: `frontend/src/views/PdfTestDetailsView.vue`
- Modify: `frontend/src/domains/visual-test/visual-test.model.ts`
- Modify: `frontend/src/domains/visual-test/visual-test.mapper.ts`
- Modify: `frontend/src/domains/pdf-test/pdf-test.model.ts`
- Modify: `frontend/src/domains/pdf-test/pdf-test.mapper.ts`
- Modify: `frontend/src/lib/pdf-download.ts`
- Modify: `frontend/src/composables/usePdfPageRender.ts`
- Modify: `frontend/src/components/pdf/PdfComparisonView.vue`
- Modify: `frontend/src/components/pdf/PdfPageViewer.vue`
- Modify: `frontend/src/components/pdf/PdfBaselineView.vue`
- Modify: `frontend/src/lib/variant-key.ts`
- Modify: `frontend/src/lib/invalidation.ts`
- Modify: `frontend/src/domains/visual-test/query-keys.ts`
- Modify: `frontend/src/domains/pdf-test/query-keys.ts`
- Test: `frontend/src/domains/pending-tests/__tests__/review-inbox.mapper.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to the inbox mapper spec:

```ts
it("maps the branch of a pending review", () => {
  const item = mapReviewInboxItem({
    comparisonId: "c1",
    projectName: "app",
    testName: "login",
    kind: "image",
    variant: {
      viewport: "1920x1080",
      browser: "chromium",
      environment: "staging",
    },
    mismatchPixelCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    branchName: "feature/x",
    isDefaultBranch: false,
  } as never);

  expect(item.branchName).toBe("feature/x");
  expect(item.isDefaultBranch).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test -- --run src/domains/pending-tests/__tests__/review-inbox.mapper.spec.ts
```

Expected: FAIL (fields missing).

- [ ] **Step 3: Add branch fields to the model and mapper**

`review-inbox.model.ts`:

```ts
branchName: string;
isDefaultBranch: boolean;
```

`review-inbox.mapper.ts`:

```ts
    branchName: dto.branchName,
    isDefaultBranch: dto.isDefaultBranch,
```

- [ ] **Step 4: Add the inbox badge and filter**

In `InboxProjectSection.vue`, render:

```vue
<Badge
  v-if="!item.isDefaultBranch"
  variant="secondary"
  class="font-mono text-[10px]"
>
  {{ item.branchName }}
</Badge>
```

Include `branchName` in `formatVariantLabel` context or add a separate line. In `openItem` and `startProjectReview`, include `branch: item.branchName` in the route query.

In `InboxView.vue`, add a `branch` ref and a `Select` populated from `new Set(items.map(i => i.branchName))`, plus filtering in `filteredSections`:

```ts
const branch = ref(FILTER_ALL);
...
(wantedBranch === FILTER_ALL || item.branchName === wantedBranch)
```

- [ ] **Step 5: Propagate branch through the details page**

`useRouteParams()` adds:

```ts
const branch = computed(() =>
  typeof route.query.branch === "string" ? route.query.branch : undefined,
);
```

Return it.

`usePendingTestsQuery(projectName, branchName, enabled)` includes `branch` in the query key and the SDK call. `pendingTestQueryKeys.list(projectName, branchName)` and `withPendingTestRemoved(client, projectName, branchName, currentKey)` take the branch too, so the optimistic removal targets the branch-scoped cache.

`useTestDetailsPage.ts`:

- `useVisualDetailsQuery` / `usePdfDetailsQuery` take `branchName: Ref<string | undefined>` and pass `query: { ...filters, ...(branchName.value ? { branch: branchName.value } : {}) }`.
- `TestDetailsAdapter.approve` takes `branchName` and passes `query: { branch: branchName }` to the approve endpoint.
- `useKindDetailsPage` accepts `branchName` and passes it to the query, pending query, and approve.
- `viewKeyOf` includes the branch? Not necessary; the route is branch-specific. Leave as-is.

`useTestNavigation` adds `branchName: Ref<string | undefined>` and includes `branch: branchName.value` in the test-detail query for both `navigateToTest` and the loop. Update its callers:

- `frontend/src/components/tables/VisualTestsTable.vue` accepts a `branchName`
  prop, passes it to `useTestNavigation`, and `ProjectDetailView.vue` passes
  `selectedBranch`.
- `frontend/src/composables/useReviewSession.ts` passes its `branchName` into
  `useTestNavigation`.
- `frontend/src/__tests__/useTestNavigation.test.ts` supplies the new option
  and asserts `branch` is present in the pushed query.

`useReviewSession` accepts `branchName` and watches it to reset the seen-set when it changes:

```ts
watch(branchName, () => {
  resetReviewSeen(projectName.value);
  beginPassProgress(projectName.value, pendingTests.value.length);
});
```

Extend `TestDetailsArgs` in `lib/variant-key.ts` with `branch?: string`, and pass
it in every `invalidateDetails(...)` call from `useReviewSession` (the context
must carry `currentBranch`). `invalidateProjectDetail` already prefix-matches
the project key, so it needs no branch.

PDF plumbing: `downloadPdfFile` (`lib/pdf-download.ts`) and
`usePdfPageRenderQuery` (`composables/usePdfPageRender.ts`) accept an optional
branch and pass it in the SDK `query`. Thread a `branchName` prop through
`PdfComparisonView.vue`, `PdfBaselineView.vue` and `PdfPageViewer.vue`;
`PdfTestDetailsView.vue` supplies `branch`. Update
`frontend/src/__tests__/pdf-download.test.ts` and
`frontend/src/__tests__/usePdfPageRender.test.ts` for the new argument.

The detail views (`VisualTestDetailsView.vue`, `PdfTestDetailsView.vue`) pass
`branch` from `useRouteParams()` into `useVisualTestDetailsPage` /
`usePdfTestDetailsPage`. Map `origin`/`inheritedFrom` in
`frontend/src/domains/visual-test/visual-test.model.ts` +
`visual-test.mapper.ts` and `frontend/src/domains/pdf-test/pdf-test.model.ts` +
`pdf-test.mapper.ts`. When the returned details carry
`origin === "inherited"`, render a `Badge` (`inherited from {{ inheritedFrom }}`)
and disable approve/skip (`useReviewShortcuts` `enabled` returns false; the
approve/skip buttons are hidden). The backend rejects inherited mutations with
`409` regardless.

- [ ] **Step 6: Update query keys**

`visualTestQueryKeys.details` and `pdfTestQueryKeys.details` add `branch` as a key part:

```ts
export const visualTestQueryKeys = {
  all: () => ["visual-tests"] as const,
  details: (
    args: {
      projectName: string;
      testName: string;
      branch?: string;
    } & VariantParams,
  ) =>
    [
      ...visualTestQueryKeys.all(),
      "details",
      args.projectName,
      args.branch ?? "",
      args.testName,
      ...variantKeyParts(args),
    ] as const,
} as const;
```

Do the same for `pdfTestQueryKeys.details`.

- [ ] **Step 7: Run tests and typecheck**

```bash
pnpm --filter ./frontend test -- --run src/domains/pending-tests/__tests__
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(branch): show and filter reviews by branch"
```

---

## Task 15: Frontend branch management

**Files:**

- Create: `frontend/src/composables/useBranchMutations.ts`
- Create: `frontend/src/components/branches/BranchActionsMenu.vue`
- Modify: `frontend/src/views/ProjectDetailView.vue`
- Test: `frontend/src/composables/__tests__/useBranchMutations.spec.ts`

- [ ] **Step 1: Write the failing test**

Create a test that mocks `branchesControllerUpdate` and `branchesControllerRemove` and asserts the mutation calls the correct SDK path/query:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const update = vi.fn().mockResolvedValue({ data: { success: true } });
const remove = vi.fn().mockResolvedValue({ data: { success: true } });

vi.mock("@sdk", () => ({
  branchesControllerUpdate: (...args: unknown[]) => update(...args),
  branchesControllerRemove: (...args: unknown[]) => remove(...args),
}));

describe("branch mutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives a branch", async () => {
    const { archiveBranch } = await import("../useBranchMutations");
    await archiveBranch("app", "feature/x", true);
    expect(update).toHaveBeenCalledWith({
      path: { projectName: "app" },
      query: { branch: "feature/x" },
      body: { isArchived: true },
    });
  });

  it("deletes a branch", async () => {
    const { deleteBranch } = await import("../useBranchMutations");
    await deleteBranch("app", "feature/x");
    expect(remove).toHaveBeenCalledWith({
      path: { projectName: "app" },
      query: { branch: "feature/x" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test -- --run src/composables/__tests__/useBranchMutations.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the mutations**

`useBranchMutations.ts`:

```ts
import { branchesControllerRemove, branchesControllerUpdate } from "@sdk";
import { unwrapSdkData } from "@/lib/sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { branchQueryKeys } from "@/domains/branches/query-keys";
import type { QueryClient } from "@tanstack/vue-query";
import { projectQueryKeys } from "@/domains/projects/query-keys";

async function run(response: unknown): Promise<unknown> {
  const data = unwrapSdkData(response);
  if (data === undefined) throw new Error("Empty response from endpoint");
  return data;
}

export async function archiveBranch(
  projectName: string,
  branch: string,
  isArchived: boolean,
) {
  return run(
    await branchesControllerUpdate({
      path: { projectName },
      query: { branch },
      body: { isArchived },
    }),
  );
}

export async function deleteBranch(projectName: string, branch: string) {
  return run(
    await branchesControllerRemove({
      path: { projectName },
      query: { branch },
    }),
  );
}

export function useBranchMutations(projectName: string) {
  const invalidate = (client: QueryClient) => {
    void client.invalidateQueries({ queryKey: branchQueryKeys.all() });
    void client.invalidateQueries({
      queryKey: projectQueryKeys.all(),
    });
  };

  const archive = useSdkMutation({
    mutationFn: ({
      branch,
      isArchived,
    }: {
      branch: string;
      isArchived: boolean;
    }) => archiveBranch(projectName, branch, isArchived),
    successMessage: "Branch updated",
    invalidate,
  });

  const remove = useSdkMutation({
    mutationFn: (branch: string) => deleteBranch(projectName, branch),
    successMessage: "Branch deleted",
    invalidate,
  });

  return { archive, remove };
}
```

- [ ] **Step 4: Add the actions menu**

`BranchActionsMenu.vue` renders a dropdown with Archive/Unarchive and Delete, disables both for the default branch, and confirms delete with `AlertDialog`. Emit `archive` / `delete` events; `ProjectDetailView.vue` wires them to `useBranchMutations`. On deleting the currently selected branch, navigate to the default branch query.

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm --filter ./frontend test -- --run src/composables/__tests__/useBranchMutations.spec.ts
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(branch): manage branches from the project view"
```

---

## Task 16: Remove `projectId`, update e2e fixtures, docs and final verification

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_make_test_branch_required/migration.sql`
- Modify: `backend/src/modules/public/visualTest/core/infrastructure/repositories/unified-test.repository.ts`
- Modify: `backend/src/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.ts` (remove unused `unifiedTests` relation if present)
- Modify: `backend/src/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.ts`
- Modify: `backend/src/modules/public/visualTest/review/infrastructure/repositories/review-inbox.repository.ts`
- Modify: `backend/src/modules/public/visualTest/review/infrastructure/repositories/test-read.repository.ts`
- Modify: `backend/src/modules/public/visualTest/core/application/services/test-deletion.service.ts`
- Modify: all e2e fixtures that create `UnifiedTest` directly
- Create: `backend/test/e2e/visualTest/branch-baselines.e2e-spec.ts`
- Modify: `CONTEXT.md`
- Create: `docs/adr/ADR-027-branch-scoped-baselines.md`

- [ ] **Step 1: Update the Prisma schema**

Change `UnifiedTest` to require the branch and drop the project relation:

```prisma
model UnifiedTest {
  id        String     @id @default(cuid())
  branch    Branch     @relation(fields: [branchId], references: [id], onDelete: Cascade)
  branchId  String
  name      String
  kind      TestKind   @default(image)
  status    TestStatus @default(PENDING)
  createdAt DateTime   @default(now())

  variants     UnifiedVariant[]
  screenshots  UnifiedScreenshot[]
  comparisons  UnifiedComparison[]

  @@unique([branchId, name])
  @@map("UnifiedTest")
}
```

Remove `unifiedTests UnifiedTest[]` from `Project`.

- [ ] **Step 2: Create the cleanup migration**

```bash
cd backend
pnpm exec prisma migrate dev --create-only --name make_test_branch_required
```

Replace the generated SQL with:

```sql
-- Enforce branch on every test
ALTER TABLE "UnifiedTest" ALTER COLUMN "branchId" SET NOT NULL;

-- Drop the project link
DROP INDEX "UnifiedTest_projectId_name_key";
ALTER TABLE "UnifiedTest" DROP CONSTRAINT "UnifiedTest_projectId_fkey";
ALTER TABLE "UnifiedTest" DROP COLUMN "projectId";
```

- [ ] **Step 3: Apply and regenerate**

```bash
cd backend
pnpm exec prisma migrate dev
pnpm run prisma:generate
pnpm run typecheck
```

Fix compile errors by switching `test.project` traversals to `test.branch.project` and `projectId` filters to `branch: { projectId }`.

Specific spots:

- `UnifiedTestRepository.findIdsByProjectId`: `where: { branch: { projectId } }`.
- `UnifiedTestRepository.ensureTest`: drop the `projectId` parameter and the
  `projectId` property from `create`; update `UploadDecisionResolver.resolveStored`
  to call `ensureTest(branch.branchId, params.testName, kind)`.
- `UnifiedTestRepository` no longer needs `ProjectRepository`; remove that
  dependency and its module provider import if unused.
- `ProjectReadRepository.getTestCounts`: join `Branch`, exclude archived branches, and `COUNT(DISTINCT t."name")`:
  ```sql
  SELECT b."projectId" AS "projectId", COUNT(DISTINCT t."name") AS "testCount"
  FROM "UnifiedTest" t
  JOIN "Branch" b ON t."branchId" = b.id
  WHERE b."isArchived" = false
  GROUP BY b."projectId"
  ```
- `ProjectReadRepository.getPendingCounts`: join `Branch`, exclude archived branches, group by `b."projectId"`.
- `ReviewInboxRepository` project select: `branch: { select: { name, project: { select: { name, group: ..., defaultBranchId: true } } } }`.
- `TestReadRepository` `test: { project: { name } }` filters: `test: { branch: { project: { name } } }`.
- `StateChangeWorkflow`/status paths do not touch `projectId`.

- [ ] **Step 4: Update e2e fixtures**

Add a helper to `backend/test/e2e/_support/utils/test-app.ts`:

```ts
  static async createProject(
    name: string,
  ): Promise<{ projectId: string; branchId: string }> {
    const app = this.appInstance;
    if (!app) throw new Error('App instance not initialized');
    const db = app.get(PrismaConnection).client;
    const project = await db.project.create({ data: { name } });
    const branch = await db.branch.create({
      data: { projectId: project.id, name: 'main' },
    });
    await db.project.update({
      where: { id: project.id },
      data: { defaultBranchId: branch.id },
    });
    return { projectId: project.id, branchId: branch.id };
  }
```

Replace direct `prisma.project.create({ data: { name } })` in e2e tests with `TestApp.createProject(name)`. For tests that need the returned project object, return it from the helper or query it after. Replace direct `prisma.unifiedTest.create({ data: { projectId, ... } })` with a branch id:

```ts
const { branchId } = await TestApp.createProject("app");
await prisma.unifiedTest.create({
  data: { branchId, name: "login", kind: "image" },
});
```

Files to update (from `grep -rn "project.create\\|unifiedTest.create" backend/test/e2e`):

- `backend/test/e2e/projects/projects.e2e-spec.ts`
- `backend/test/e2e/projects/review-inbox.e2e-spec.ts`
- `backend/test/e2e/projects/project-pending-status.e2e-spec.ts`
- `backend/test/e2e/pdfTest/pdf-test-queries.e2e-spec.ts`
- `backend/test/e2e/pdfTest/pdf-upload-and-compare.e2e-spec.ts`
- `backend/test/e2e/pdfTest/pdf-approval.e2e-spec.ts`
- `backend/test/e2e/threshold/threshold-update-clears-pending.e2e-spec.ts`
- `backend/test/e2e/data-deletion/cleanup-orphaned-screenshots.e2e-spec.ts`
- `backend/test/e2e/data-deletion/comparison-job-cascade.e2e-spec.ts`
- `backend/test/e2e/visualTest/visual-test-queries.e2e-spec.ts`
- `backend/test/e2e/visualTest/pending-tests.e2e-spec.ts`

- [ ] **Step 5: Add the branch e2e test**

Create `backend/test/e2e/visualTest/branch-baselines.e2e-spec.ts`:

```ts
import { INestApplication } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { TestApp } from "../_support/utils/test-app";
import { authRequest } from "../_support/utils/authenticated-request";
import { waitForComparison } from "../_support/utils/wait-for-comparison";

describe("Branch baselines (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  const file = (name: string) =>
    fs.createReadStream(path.join(__dirname, "fixtures", name));

  async function upload(
    branch: string | undefined,
    environment: string,
    filename: string,
    testName = "login",
  ) {
    const req = authRequest(app).post(
      `/api/v1/projects/branch-app/tests/${testName}/upload?testKind=image`,
    );
    if (branch) req.field("branch", branch);
    return req
      .field("viewport", "1920x1080")
      .field("browser", "chromium")
      .field("environment", environment)
      .attach("file", file(filename));
  }

  it("inherits the main baseline and pins after approval", async () => {
    await upload(undefined, "staging", "baseline_black.png").expect(201);

    const feature = await upload(
      "feature/x",
      "staging",
      "baseline_blue.png",
    ).expect(201);
    expect(feature.body.status).toBe("COMPARISON_QUEUED");

    const pending = await waitForComparison(
      app,
      "branch-app",
      "login",
      undefined,
      "feature/x",
    );
    expect(pending.body.comparison.id).toBeDefined();

    await authRequest(app)
      .post("/api/v1/projects/branch-app/tests/login/approval")
      .query({ branch: "feature/x" })
      .send({ comparisonId: pending.body.comparison.id })
      .expect(201);

    const main = await authRequest(app)
      .get("/api/v1/projects/branch-app/tests/login")
      .query({
        viewport: "1920x1080",
        browser: "chromium",
        environment: "staging",
      });
    expect(main.body.baseline.imageHash).toBeDefined();

    const featureDetails = await authRequest(app)
      .get("/api/v1/projects/branch-app/tests/login")
      .query({
        branch: "feature/x",
        viewport: "1920x1080",
        browser: "chromium",
        environment: "staging",
      });
    expect(featureDetails.body.baseline.imageHash).not.toBe(
      main.body.baseline.imageHash,
    );
  });

  it("shows an unmaterialized test as inherited", async () => {
    await upload(undefined, "staging", "baseline_black.png").expect(201);
    // A branch only exists after its first upload; materialize it with a
    // different test so `login` remains inherited from main.
    await upload(
      "feature/empty",
      "staging",
      "baseline_blue.png",
      "other",
    ).expect(201);

    const list = await authRequest(app)
      .get("/api/v1/projects/branch-app/tests")
      .query({ branch: "feature/empty" })
      .expect(200);

    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "login",
          origin: "inherited",
          inheritedFrom: "main",
        }),
      ]),
    );
  });

  it("rejects uploads to an archived branch", async () => {
    await upload("feature/old", "staging", "baseline_black.png").expect(201);

    await authRequest(app)
      .patch("/api/v1/projects/branch-app/branches")
      .query({ branch: "feature/old" })
      .send({ isArchived: true })
      .expect(200);

    await upload("feature/old", "staging", "baseline_blue.png").expect(409);
  });
});
```

Extend `waitForComparison` with an optional branch argument so the branch test
can poll the right view. In `backend/test/e2e/_support/utils/wait-for-comparison.ts`,
change the signature to add `branch?: string` after `filters`, build
`const query = { ...filters, ...(branch ? { branch } : {}) };`, and replace
`.query(filters)` with `.query(query)` in both the details and pdf-details
requests.

Then call it in the branch test as
`waitForComparison(app, 'branch-app', 'login', undefined, 'feature/x')`.

- [ ] **Step 6: Update the domain docs**

Add a **Branch** section to `CONTEXT.md` under Language and a short implementation note:

```md
**Branch**:
A named line of development inside a Project. Owns its own UnifiedTests, baselines and review status. Exactly one Branch per Project is the default; feature branches inherit unowned baselines from their target branch until the first approval pins the variant.

_Avoid_: Environment (that is a Variant dimension), fork (that is the baseline clone)
```

Add an implementation note describing the inherited-baseline rule and the Branch View.

Create `docs/adr/ADR-027-branch-scoped-baselines.md` with Status, Context, Decision, Consequences (mirroring the spec's architecture and trade-offs). Follow the format of an existing ADR (read `docs/adr/` before writing).

- [ ] **Step 7: Run the full verification**

```bash
pnpm run lint
pnpm run typecheck:all
pnpm run format
pnpm run unitTest
pnpm --filter ./frontend test -- --run
pnpm run sdk:generate && pnpm run sdk:build
git diff --exit-code client-sdk backend/swagger.json
```

Expected: lint/typecheck/format clean, all backend and frontend tests pass, SDK generation produces no diff.

- [ ] **Step 8: Commit**

```bash
git add backend frontend client-sdk CONTEXT.md docs
git commit -m "feat(branch): finalize branch-scoped baselines"
```

---

## Self-Review Checklist

Before handing the plan off, verify:

- [ ] Every spec goal has a task: branch entity (1,4), default branch (2), upload params (5), inheritance (6), approval pin (7), branch reads/views (8), inbox (9), archive/delete/default/target (10), commands/approval/PDF (11), SDK (12), UI switcher/badge (13), inbox/review loop (14), management UI (15), migration cleanup/docs (16).
- [ ] No placeholder steps: every code change has a snippet or an exact instruction.
- [ ] Names are consistent: `BranchResolver.resolveRead/resolveForUpload/assertValidTarget`, `BranchRepository.findTargetChainIds/findDefault/findByProjectAndName`, `BranchTestRepository.findEffectiveTest(s)/findOwnTest`, `BranchBaselineResolver.resolveForVariant`, `markBaselineOwned`.
- [ ] The spec's "pin when the target baseline disappears" correction matches Task 6.
- [ ] The plan keeps the tree compiling by deferring the `projectId` removal to Task 16.
