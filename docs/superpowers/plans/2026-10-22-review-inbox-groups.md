# Review-Inbox & Project Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the review inbox the landing page, add `ProjectGroup` organization, and unify the review/project surfaces without introducing permissions.

**Architecture:** Backend adds a `ProjectGroup` table, group CRUD, project group assignment, project counts, and a global pending-review read model. The SDK is regenerated, then the Vue app gains groups/projects/inbox domains, a sidebar shell, grouped project/inbox views, and a unified test list. Groups are labels only; no auth/guard changes.

**Tech Stack:** NestJS + Prisma + PostgreSQL; Vue 3 + Vite + Tailwind v4 + TanStack Vue Query; Playwright CT/E2E/quality; generated TypeScript SDK.

---

## File structure

Backend:

- Modify `backend/prisma/schema.prisma`
- Create `backend/prisma/migrations/<timestamp>_add_project_groups/migration.sql`
- Create `backend/src/modules/public/visualTest/review/presentation/dto/project-group.dto.ts`
- Create `backend/src/modules/public/visualTest/review/infrastructure/repositories/project-group.repository.ts`
- Create `backend/src/modules/public/visualTest/review/application/project-group.service.ts`
- Create `backend/src/modules/public/visualTest/review/presentation/controllers/project-groups.controller.ts`
- Create `backend/src/modules/public/visualTest/review/infrastructure/repositories/review-inbox.repository.ts`
- Create `backend/src/modules/public/visualTest/review/application/review-inbox.service.ts`
- Create `backend/src/modules/public/visualTest/review/presentation/controllers/review-inbox.controller.ts`
- Modify `backend/src/modules/public/visualTest/review/presentation/dto/project.dto.ts`
- Modify `backend/src/modules/public/visualTest/review/presentation/dto/review-responses.dto.ts`
- Modify `backend/src/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.ts`
- Modify `backend/src/modules/public/visualTest/review/application/project.service.ts`
- Modify `backend/src/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.ts`
- Modify `backend/src/modules/public/visualTest/review/presentation/controllers/projects.controller.ts`
- Modify `backend/src/modules/public/visualTest/review/review.module.ts`
- Modify `backend/src/modules/public/visualTest/review/presentation/dto/comparison.dto.ts` only if `createdAt` is missing (it already exists; no change expected)
- Create `backend/test/e2e/projects/groups.e2e-spec.ts`
- Create `backend/test/e2e/projects/review-inbox.e2e-spec.ts`
- Create `backend/test/unit/modules/public/visualTest/review/application/project-group.service.spec.ts`
- Create `backend/test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts`
- Modify `backend/test/unit/modules/public/visualTest/review/application/project.service.spec.ts`
- Modify `backend/test/unit/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.spec.ts`
- Modify `backend/test/unit/modules/public/visualTest/review/presentation/controllers/projects.controller.spec.ts`

Frontend:

- Create `frontend/src/domains/groups/group.model.ts`
- Create `frontend/src/domains/groups/group.mapper.ts`
- Create `frontend/src/domains/groups/query-keys.ts`
- Create `frontend/src/domains/groups/__tests__/group.mapper.test.ts`
- Create `frontend/src/composables/useGroups.ts`
- Create `frontend/src/domains/projects/group-projects-by-group.ts`
- Create `frontend/src/domains/projects/__tests__/group-projects-by-group.test.ts`
- Modify `frontend/src/domains/projects/project.model.ts`
- Modify `frontend/src/domains/projects/project.mapper.ts`
- Modify `frontend/src/domains/projects/__tests__/project.mapper.test.ts`
- Create `frontend/src/domains/pending-tests/review-inbox.model.ts`
- Create `frontend/src/domains/pending-tests/review-inbox.mapper.ts`
- Create `frontend/src/domains/pending-tests/group-review-inbox.ts`
- Create `frontend/src/domains/pending-tests/__tests__/review-inbox.mapper.test.ts`
- Create `frontend/src/domains/pending-tests/__tests__/group-review-inbox.test.ts`
- Modify `frontend/src/domains/pending-tests/query-keys.ts`
- Create `frontend/src/composables/useReviewInbox.ts`
- Create `frontend/src/composables/useReviewShortcuts.ts`
- Create `frontend/src/lib/format-date.ts`
- Create `frontend/src/lib/__tests__` is not a convention; place tests in `frontend/src/__tests__/format-date.test.ts`
- Create `frontend/src/components/AppSidebar.vue`
- Create `frontend/src/components/AppShell.vue`
- Create `frontend/src/components/FormDialog.vue`
- Create `frontend/src/components/groups/GroupFormDialog.vue`
- Create `frontend/src/components/projects/NewProjectDialog.vue`
- Create `frontend/src/components/projects/MoveProjectDialog.vue`
- Create `frontend/src/components/inbox/InboxProjectSection.vue`
- Create `frontend/src/components/projects/ProjectGroupSection.vue`
- Create `frontend/src/views/InboxView.vue`
- Create `frontend/src/views/InboxView.story.ts`
- Create `frontend/src/views/GroupsView.vue`
- Create `frontend/src/views/GroupsView.story.ts`
- Modify `frontend/src/views/ProjectsView.vue`
- Modify `frontend/src/views/ProjectDetailView.vue`
- Modify `frontend/src/views/ProjectDetailView.story.ts` only if needed (existing routed story stays)
- Modify `frontend/src/views/VisualTestDetailsView.vue`
- Modify `frontend/src/views/PdfTestDetailsView.vue`
- Modify `frontend/src/App.vue`
- Modify `frontend/src/AppShell.story.ts`
- Modify `frontend/src/router/index.ts`
- Modify `frontend/src/composables/useAuth.ts`
- Modify `frontend/src/composables/useRouteParams.ts`
- Modify `frontend/src/composables/useTestDetailsPage.ts`
- Modify `frontend/src/composables/useReviewSession.ts`
- Modify `frontend/src/composables/useTestNavigation.ts`
- Modify `frontend/src/composables/useProjectDetailPage.ts`
- Modify `frontend/src/composables/useVisualTestsTable.ts`
- Modify `frontend/src/domains/test-status/filters.ts`
- Modify `frontend/src/components/tables/TestFilterBar.vue`
- Modify `frontend/src/components/tables/VisualTestsTable.vue`
- Modify `frontend/src/components/TestComparisonInfo.vue` only to show age (optional; keep threshold behavior)
- Modify `frontend/src/lib/invalidation.ts`
- Modify `frontend/src/lib/test-ids.ts`
- Modify `frontend/src/__tests__/useReviewSession.test.ts`
- Modify `frontend/src/__tests__/useRouteParams.test.ts`
- Modify `frontend/src/__tests__/useVisualTestsTable.test.ts`
- Create `frontend/src/__tests__/useReviewShortcuts.test.ts`
- Create `frontend/src/__tests__/format-date.test.ts`
- Create `frontend/tests/ct/inbox.spec.ts`
- Create `frontend/tests/ct/groups.spec.ts`
- Create `frontend/tests/ct/mocks/groups.mocks.ts`
- Modify `frontend/tests/ct/mocks/projects.mocks.ts`
- Modify `frontend/tests/ct/project-list.spec.ts`
- Modify `frontend/tests/ct/project-detail.spec.ts`
- Modify `frontend/tests/e2e/navigation.spec.ts`
- Create `frontend/tests/e2e/review-inbox.spec.ts`
- Modify `frontend/tests/quality/cases.ts`

---

## Phase 1: Backend

### Task 1: Add `ProjectGroup` schema and migration

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_project_groups/migration.sql`
- Modify: `backend/test/e2e/_support/utils/test-app.ts`

- [ ] **Step 1: Add the Prisma models**

At the top of `backend/prisma/schema.prisma`, add:

```prisma
model ProjectGroup {
  id        String    @id @default(cuid())
  name      String    @unique
  createdAt DateTime  @default(now())
  projects  Project[]

  @@map("ProjectGroup")
}
```

Change the `Project` model to:

```prisma
model Project {
  id           String        @id @default(cuid())
  name         String        @unique
  createdAt    DateTime      @default(now())
  groupId      String?
  group        ProjectGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  unifiedTests UnifiedTest[]

  @@index([groupId])
}
```

- [ ] **Step 2: Create and apply the migration**

Run:

```bash
./scripts/dev.sh infra
pnpm --filter ./backend exec prisma migrate dev --name add_project_groups
```

Expected: a new migration directory exists and the database has `ProjectGroup` plus `Project.groupId`.

Verify the generated SQL contains the table, unique index, column, index, and FK:

```bash
grep -E 'ProjectGroup|groupId' backend/prisma/migrations/*_add_project_groups/migration.sql
```

- [ ] **Step 3: Generate the Prisma client**

Run:

```bash
pnpm --filter ./backend db:prepare
```

Expected: Prisma client generation succeeds.

- [ ] **Step 4: Reset groups between e2e tests**

In `backend/test/e2e/_support/utils/test-app.ts`, after `await db.project.deleteMany();` add:

```ts
await db.projectGroup.deleteMany();
```

Projects are deleted first, so the FK `SetNull` is not exercised here; the order keeps the reset deterministic.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/test/e2e/_support/utils/test-app.ts
git commit -m "feat(backend): add project groups schema"
```

### Task 2: Add group CRUD API

**Files:**

- Create: `backend/src/modules/public/visualTest/review/presentation/dto/project-group.dto.ts`
- Create: `backend/src/modules/public/visualTest/review/infrastructure/repositories/project-group.repository.ts`
- Create: `backend/src/modules/public/visualTest/review/application/project-group.service.ts`
- Create: `backend/src/modules/public/visualTest/review/presentation/controllers/project-groups.controller.ts`
- Modify: `backend/src/modules/public/visualTest/review/review.module.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/application/project-group.service.spec.ts`
- Test: `backend/test/e2e/projects/groups.e2e-spec.ts`

- [ ] **Step 1: Write the failing service test**

Create `backend/test/unit/modules/public/visualTest/review/application/project-group.service.spec.ts`:

```ts
import type { Mocked } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ProjectGroupService } from "@public/visualTest/review/application/project-group.service";
import { ProjectGroupRepository } from "@public/visualTest/review/infrastructure/repositories/project-group.repository";
import { createMock } from "@test/utils/create-mock";

describe("ProjectGroupService", () => {
  let service: ProjectGroupService;
  let groups: Mocked<ProjectGroupRepository>;

  beforeEach(async () => {
    groups = createMock<ProjectGroupRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectGroupService,
        { provide: ProjectGroupRepository, useValue: groups },
      ],
    }).compile();
    service = module.get(ProjectGroupService);
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists groups", async () => {
    const rows = [
      {
        id: "g1",
        name: "Checkout",
        createdAt: new Date(),
        projectCount: 2,
      },
    ];
    groups.findAll.mockResolvedValue(rows);

    await expect(service.findAll()).resolves.toEqual(rows);
  });

  it("creates a group", async () => {
    const row = {
      id: "g1",
      name: "Checkout",
      createdAt: new Date(),
      projectCount: 0,
    };
    groups.create.mockResolvedValue(row);

    await expect(service.create("Checkout")).resolves.toEqual(row);
    expect(groups.create).toHaveBeenCalledWith("Checkout");
  });

  it("renames a group", async () => {
    const row = {
      id: "g1",
      name: "Storefront",
      createdAt: new Date(),
      projectCount: 1,
    };
    groups.rename.mockResolvedValue(row);

    await expect(service.rename("g1", "Storefront")).resolves.toEqual(row);
  });

  it("deletes a group and returns success", async () => {
    groups.delete.mockResolvedValue(undefined);

    await expect(service.delete("g1")).resolves.toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/project-group.service.spec.ts
```

Expected: FAIL because `project-group.service` does not exist.

- [ ] **Step 3: Create the DTO**

Create `backend/src/modules/public/visualTest/review/presentation/dto/project-group.dto.ts`:

```ts
import { Expose, Transform } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

const GROUP_NAME_REGEXP = /^[\p{L}\p{N} _-]+$/u;
const GROUP_NAME_MAX_LENGTH = 80;

export class ProjectGroupDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty()
  @IsDate()
  @Expose()
  createdAt!: Date;

  @ApiProperty()
  @IsInt()
  @Expose()
  projectCount!: number;
}

export class CreateProjectGroupDto {
  @ApiProperty({ example: "Checkout" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(GROUP_NAME_MAX_LENGTH)
  @Matches(GROUP_NAME_REGEXP, {
    message:
      "Group name may contain letters, numbers, spaces, dashes and underscores",
  })
  name!: string;
}

export class UpdateProjectGroupDto {
  @ApiProperty({ example: "Storefront" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(GROUP_NAME_MAX_LENGTH)
  @Matches(GROUP_NAME_REGEXP, {
    message:
      "Group name may contain letters, numbers, spaces, dashes and underscores",
  })
  name!: string;
}
```

- [ ] **Step 4: Create the repository**

Create `backend/src/modules/public/visualTest/review/infrastructure/repositories/project-group.repository.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { DomainError } from "@common/domain/domain-error";

export interface ProjectGroupSummary {
  id: string;
  name: string;
  createdAt: Date;
  projectCount: number;
}

type GroupRow = {
  id: string;
  name: string;
  createdAt: Date;
  _count: { projects: number };
};

function toSummary(row: GroupRow): ProjectGroupSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    projectCount: row._count.projects,
  };
}

@Injectable()
export class ProjectGroupRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  async findAll(): Promise<ProjectGroupSummary[]> {
    const rows = await this.client.projectGroup.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { projects: true } } },
    });
    return rows.map(toSummary);
  }

  async findById(id: string) {
    return this.client.projectGroup.findUnique({ where: { id } });
  }

  async create(name: string): Promise<ProjectGroupSummary> {
    const existing = await this.client.projectGroup.findUnique({
      where: { name },
    });
    if (existing) {
      throw new DomainError('"name" already exists', "E_UNIQUE_CONSTRAINT");
    }
    const row = await this.client.projectGroup.create({
      data: { name },
      include: { _count: { select: { projects: true } } },
    });
    return toSummary(row);
  }

  async rename(id: string, name: string): Promise<ProjectGroupSummary> {
    const group = await this.client.projectGroup.findUnique({ where: { id } });
    if (!group) {
      throw new DomainError(`Group "${id}" not found`, "NOT_FOUND");
    }
    const duplicate = await this.client.projectGroup.findFirst({
      where: { name, id: { not: id } },
    });
    if (duplicate) {
      throw new DomainError('"name" already exists', "E_UNIQUE_CONSTRAINT");
    }
    const row = await this.client.projectGroup.update({
      where: { id },
      data: { name },
      include: { _count: { select: { projects: true } } },
    });
    return toSummary(row);
  }

  async delete(id: string): Promise<void> {
    const group = await this.client.projectGroup.findUnique({ where: { id } });
    if (!group) {
      throw new DomainError(`Group "${id}" not found`, "NOT_FOUND");
    }
    await this.client.projectGroup.delete({ where: { id } });
  }
}
```

- [ ] **Step 5: Create the service**

Create `backend/src/modules/public/visualTest/review/application/project-group.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import {
  ProjectGroupRepository,
  type ProjectGroupSummary,
} from "@public/visualTest/review/infrastructure/repositories/project-group.repository";

@Injectable()
export class ProjectGroupService {
  constructor(private readonly groups: ProjectGroupRepository) {}

  findAll(): Promise<ProjectGroupSummary[]> {
    return this.groups.findAll();
  }

  create(name: string): Promise<ProjectGroupSummary> {
    return this.groups.create(name);
  }

  rename(id: string, name: string): Promise<ProjectGroupSummary> {
    return this.groups.rename(id, name);
  }

  async delete(id: string): Promise<{ success: true }> {
    await this.groups.delete(id);
    return { success: true };
  }
}
```

- [ ] **Step 6: Create the controller**

Create `backend/src/modules/public/visualTest/review/presentation/controllers/project-groups.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { plainToInstance } from "class-transformer";
import { ProjectGroupService } from "@public/visualTest/review/application/project-group.service";
import {
  CreateProjectGroupDto,
  ProjectGroupDto,
  UpdateProjectGroupDto,
} from "@public/visualTest/review/presentation/dto/project-group.dto";

@ApiTags("Groups")
@Controller("groups")
export class ProjectGroupsController {
  constructor(private readonly groups: ProjectGroupService) {}

  @Get()
  @ApiOperation({ summary: "List project groups" })
  @ApiOkResponse({ type: [ProjectGroupDto] })
  async findAll(): Promise<ProjectGroupDto[]> {
    const rows = await this.groups.findAll();
    return rows.map((row) =>
      plainToInstance(ProjectGroupDto, row, { excludeExtraneousValues: true }),
    );
  }

  @Post()
  @ApiOperation({ summary: "Create a project group" })
  @ApiCreatedResponse({ type: ProjectGroupDto })
  async create(@Body() dto: CreateProjectGroupDto): Promise<ProjectGroupDto> {
    const row = await this.groups.create(dto.name);
    return plainToInstance(ProjectGroupDto, row, {
      excludeExtraneousValues: true,
    });
  }

  @Patch(":id")
  @ApiOperation({ summary: "Rename a project group" })
  @ApiOkResponse({ type: ProjectGroupDto })
  async rename(
    @Param("id") id: string,
    @Body() dto: UpdateProjectGroupDto,
  ): Promise<ProjectGroupDto> {
    const row = await this.groups.rename(id, dto.name);
    return plainToInstance(ProjectGroupDto, row, {
      excludeExtraneousValues: true,
    });
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a project group" })
  @ApiOkResponse({ description: "Projects move to Unassigned" })
  async remove(@Param("id") id: string): Promise<{ success: true }> {
    return this.groups.delete(id);
  }
}
```

- [ ] **Step 7: Register controller and provider**

Modify `backend/src/modules/public/visualTest/review/review.module.ts`:

```ts
import { ProjectGroupsController } from '@public/visualTest/review/presentation/controllers/project-groups.controller';
import { ProjectGroupService } from '@public/visualTest/review/application/project-group.service';
import { ProjectGroupRepository } from '@public/visualTest/review/infrastructure/repositories/project-group.repository';

// controllers array
ProjectsController,
ProjectGroupsController,
// ...

// providers array
ProjectGroupService,
ProjectGroupRepository,
```

- [ ] **Step 8: Run the service test**

Run:

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/project-group.service.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Write the e2e group lifecycle test**

Create `backend/test/e2e/projects/groups.e2e-spec.ts`:

```ts
import { INestApplication } from "@nestjs/common";
import { TestApp } from "../_support/utils/test-app";
import { authRequest } from "../_support/utils/authenticated-request";

describe("Project groups (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  it("creates, assigns, unassigns and deletes a group", async () => {
    const group = await authRequest(app)
      .post("/api/v1/groups")
      .send({ name: "Checkout" })
      .expect(201);
    expect(group.body).toMatchObject({ name: "Checkout", projectCount: 0 });

    const project = await authRequest(app)
      .post("/api/v1/projects")
      .send({ name: "checkout-ui", groupId: group.body.id })
      .expect(201);
    expect(project.body).toMatchObject({
      name: "checkout-ui",
      groupId: group.body.id,
      groupName: "Checkout",
    });

    const assigned = await authRequest(app)
      .get("/api/v1/projects/pending")
      .expect(200);
    expect(assigned.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "checkout-ui",
          groupId: group.body.id,
          groupName: "Checkout",
          pendingCount: 0,
          testCount: 0,
        }),
      ]),
    );

    await authRequest(app)
      .patch("/api/v1/projects/checkout-ui")
      .send({ groupId: null })
      .expect(200);

    const unassigned = await authRequest(app)
      .get("/api/v1/projects/pending")
      .expect(200);
    expect(unassigned.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "checkout-ui",
          groupId: null,
          groupName: null,
        }),
      ]),
    );

    await authRequest(app)
      .delete(`/api/v1/groups/${group.body.id}`)
      .expect(200);
  });

  it("rejects duplicate group names", async () => {
    await authRequest(app)
      .post("/api/v1/groups")
      .send({ name: "Checkout" })
      .expect(201);
    await authRequest(app)
      .post("/api/v1/groups")
      .send({ name: "Checkout" })
      .expect(409);
  });
});
```

- [ ] **Step 10: Run the e2e test**

Run:

```bash
NODE_ENV=test pnpm --filter ./backend test:e2e -- test/e2e/projects/groups.e2e-spec.ts
```

Expected: FAIL on this first run because project group assignment lands in Task 3. Keep the test; re-run it after Task 3 and expect PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/public/visualTest/review backend/test/unit/modules/public/visualTest/review/application/project-group.service.spec.ts backend/test/e2e/projects/groups.e2e-spec.ts
git commit -m "feat(backend): add project group CRUD"
```

### Task 3: Add project counts, group assignment, and group-aware reads

**Files:**

- Modify: `backend/src/modules/public/visualTest/review/presentation/dto/project.dto.ts`
- Modify: `backend/src/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.ts`
- Modify: `backend/src/modules/public/visualTest/review/application/project.service.ts`
- Modify: `backend/src/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.ts`
- Modify: `backend/src/modules/public/visualTest/review/presentation/controllers/projects.controller.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.spec.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/application/project.service.spec.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/presentation/controllers/projects.controller.spec.ts`

- [ ] **Step 1: Write the failing read-repository test**

In `backend/test/unit/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.spec.ts`, replace the `getAllWithPendingFlag` test with:

```ts
it("returns projects with group, pending count and test count", async () => {
  mockClient.project.findMany.mockResolvedValue([
    {
      id: "proj-1",
      name: "a",
      createdAt: new Date(),
      group: { id: "g1", name: "Checkout" },
    },
    {
      id: "proj-2",
      name: "b",
      createdAt: new Date(),
      group: null,
    },
  ]);
  mockClient.project.count.mockResolvedValue(2);
  mockClient.$queryRaw
    .mockResolvedValueOnce([{ projectId: "proj-1", pendingCount: BigInt(3) }])
    .mockResolvedValueOnce([
      { projectId: "proj-1", testCount: BigInt(2) },
      { projectId: "proj-2", testCount: BigInt(1) },
    ]);

  const result = await repository.getAllWithPendingFlag();

  expect(result.data[0]).toMatchObject({
    id: "proj-1",
    groupId: "g1",
    groupName: "Checkout",
    pendingCount: 3,
    testCount: 2,
    hasPendingComparisons: true,
  });
  expect(result.data[1]).toMatchObject({
    id: "proj-2",
    groupId: null,
    groupName: null,
    pendingCount: 0,
    testCount: 1,
    hasPendingComparisons: false,
  });
  expect(mockClient.project.findMany).toHaveBeenCalledWith({
    orderBy: { createdAt: "desc" },
    skip: undefined,
    take: undefined,
    include: { group: { select: { id: true, name: true } } },
  });
});
```

Also update the existing `getWithLatestVariantStatuses` fixtures: add `group: null` to the mocked project and add `groupId: null, groupName: null` to the expected object (and to the `toMatchObject` assertions for the PENDING/UNCHANGED cases). The query now includes the group relation.

Add a `getTestCounts` test:

```ts
it("returns distinct test counts per project", async () => {
  mockClient.$queryRaw.mockResolvedValue([
    { projectId: "proj-1", testCount: BigInt(4) },
  ]);

  await expect(repository.getTestCounts(["proj-1"])).resolves.toEqual([
    { projectId: "proj-1", testCount: 4 },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.spec.ts
```

Expected: FAIL because `getTestCounts` and the new summary fields do not exist.

- [ ] **Step 3: Extend the project DTO**

Modify `backend/src/modules/public/visualTest/review/presentation/dto/project.dto.ts`:

Add to `ProjectDto`:

```ts
  @ApiPropertyOptional({ example: 'group_123', nullable: true })
  @IsOptional()
  @IsString()
  @Expose()
  groupId?: string | null;

  @ApiPropertyOptional({ example: 'Checkout', nullable: true })
  @IsOptional()
  @IsString()
  @Expose()
  groupName?: string | null;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Expose()
  pendingCount?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Expose()
  testCount?: number;
```

Add to `CreateProjectDto`:

```ts
  @ApiPropertyOptional({ example: 'group_123' })
  @IsOptional()
  @IsString()
  groupId?: string;
```

Add a new DTO at the bottom of the file:

```ts
export class UpdateProjectDto {
  @ApiPropertyOptional({
    description: "Group id, or null to move the project to Unassigned",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  groupId?: string | null;
}
```

- [ ] **Step 4: Extend the project read repository**

Modify interfaces in `backend/src/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.ts`:

```ts
export interface TestCount {
  projectId: string;
  testCount: number;
}

interface ProjectVariantStatus {
  testName: string;
  kind: string;
  viewport: string;
  browser: string;
  environment: string;
  status: TestStatus;
}

interface ProjectWithVariants {
  id: string;
  name: string;
  createdAt: Date;
  groupId: string | null;
  groupName: string | null;
  variants: ProjectVariantStatus[];
}

interface ProjectPendingFlag {
  id: string;
  name: string;
  createdAt: Date;
  groupId: string | null;
  groupName: string | null;
  pendingCount: number;
  testCount: number;
  hasPendingComparisons: boolean;
}
```

Replace `getWithLatestVariantStatuses` with:

```ts
  async getWithLatestVariantStatuses(
    projectName: string,
  ): Promise<ProjectWithVariants | null> {
    const project = await this.client.project.findUnique({
      where: { name: projectName },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!project) return null;

    const signalRows = await this.variants.findVariantStatusSignalsFor({
      test: { project: { name: projectName } },
    });
    const resultVariants: ProjectVariantStatus[] = signalRows.map((row) => ({
      testName: row.testName,
      kind: row.testKind,
      viewport: row.viewport,
      browser: row.browser,
      environment: row.environment,
      status: resolveVariantStatusFromComparison(
        row.latestComparisonStatus ?? undefined,
        row.hasBaseline,
      ),
    }));

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      groupId: project.group?.id ?? null,
      groupName: project.group?.name ?? null,
      variants: resultVariants,
    };
  }
```

Replace `getAllWithPendingFlag` with:

```ts
  async getAllWithPendingFlag(pagination?: {
    skip: number;
    take: number;
  }): Promise<{
    data: ProjectPendingFlag[];
    total: number;
  }> {
    const [projects, total] = await Promise.all([
      this.client.project.findMany({
        orderBy: { createdAt: 'desc' },
        skip: pagination?.skip,
        take: pagination?.take,
        include: { group: { select: { id: true, name: true } } },
      }),
      this.client.project.count(),
    ]);

    return { data: await this.hydrateProjects(projects), total };
  }

  private async hydrateProjects(
    projects: Array<{
      id: string;
      name: string;
      createdAt: Date;
      group: { id: string; name: string } | null;
    }>,
  ): Promise<ProjectPendingFlag[]> {
    if (projects.length === 0) return [];
    const projectIds = projects.map((p) => p.id);
    const [pendingCounts, testCounts] = await Promise.all([
      this.getPendingCounts(projectIds),
      this.getTestCounts(projectIds),
    ]);
    const pendingByProject = new Map(
      pendingCounts.map((count) => [count.projectId, count.pendingCount]),
    );
    const testsByProject = new Map(
      testCounts.map((count) => [count.projectId, count.testCount]),
    );

    return projects.map((project) => {
      const pendingCount = pendingByProject.get(project.id) ?? 0;
      return {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        groupId: project.group?.id ?? null,
        groupName: project.group?.name ?? null,
        pendingCount,
        testCount: testsByProject.get(project.id) ?? 0,
        hasPendingComparisons: pendingCount > 0,
      };
    });
  }

  async getProjectSummary(
    projectName: string,
  ): Promise<ProjectPendingFlag | null> {
    const project = await this.client.project.findUnique({
      where: { name: projectName },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!project) return null;
    const [summary] = await this.hydrateProjects([project]);
    return summary ?? null;
  }

  async getTestCounts(projectIds?: string[]): Promise<TestCount[]> {
    const result = await this.client.$queryRaw<
      { projectId: string; testCount: bigint }[]
    >`
      SELECT "projectId", COUNT(*) as "testCount"
      FROM "UnifiedTest"
      WHERE ${
        projectIds && projectIds.length > 0
          ? Prisma.sql`"projectId" IN (${Prisma.join(projectIds)})`
          : Prisma.sql`TRUE`
      }
      GROUP BY "projectId"
    `;
    return result.map(({ projectId, testCount }) => ({
      projectId,
      testCount: Number(testCount),
    }));
  }
```

- [ ] **Step 5: Extend `ProjectRepository`**

Modify `backend/src/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.ts`:

```ts
export interface ProjectData {
  id: string;
  name: string;
  createdAt: Date;
  groupId?: string | null;
}
```

Change `create`:

```ts
  async create(name: string, groupId?: string | null): Promise<ProjectData> {
    const existing = await this.client.project.findUnique({
      where: { name },
    });
    if (existing) {
      throw new DomainError('"name" already exists', 'E_UNIQUE_CONSTRAINT');
    }
    return this.client.project.create({
      data: { name, ...(groupId ? { groupId } : {}) },
    });
  }

  // Standalone write: moving a project between groups does not mutate test
  // state, so it deliberately skips assertWritable like create.
  async updateGroupByName(
    projectName: string,
    groupId: string | null,
  ): Promise<ProjectData> {
    return this.client.project.update({
      where: { name: projectName },
      data: { groupId },
    });
  }
```

- [ ] **Step 6: Extend `ProjectService`**

Modify `backend/src/modules/public/visualTest/review/application/project.service.ts`:

Add the import:

```ts
import { ProjectGroupRepository } from "@public/visualTest/review/infrastructure/repositories/project-group.repository";
```

Add the constructor parameter:

```ts
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectRead: ProjectReadRepository,
    private readonly testDeletion: TestDeletionService,
    private readonly groups: ProjectGroupRepository,
  ) {}
```

Replace `getAllWithPendingFlag` with:

```ts
  async getAllWithPendingFlag(pagination: PaginationDto) {
    return paginatedQuery(
      (args) => this.projectRead.getAllWithPendingFlag(args),
      pagination,
      (p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        groupId: p.groupId,
        groupName: p.groupName,
        pendingCount: p.pendingCount,
        testCount: p.testCount,
        pending: p.hasPendingComparisons,
      }),
    );
  }
```

Change `getWithLatestVariantStatuses` return:

```ts
return {
  id: project.id,
  name: project.name,
  createdAt: project.createdAt,
  groupId: project.groupId,
  groupName: project.groupName,
  visualTests: project.variants.map((v) => ({
    name: v.testName,
    kind: v.kind,
    variant: {
      viewport: v.viewport,
      browser: v.browser,
      environment: v.environment,
    },
    latestStatus: v.status,
  })),
};
```

Replace `create`:

```ts
  async create(
    name: string,
    groupId?: string,
  ): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    groupId: string | null;
    groupName: string | null;
    pendingCount: number;
    testCount: number;
    pending: boolean;
  }> {
    const group = groupId ? await this.groups.findById(groupId) : null;
    if (groupId && !group) {
      throw new DomainError(`Group "${groupId}" not found`, 'NOT_FOUND');
    }
    const project = await this.projects.create(name, groupId ?? null);
    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      pendingCount: 0,
      testCount: 0,
      pending: false,
    };
  }

  async updateProjectGroup(
    projectName: string,
    groupId: string | null | undefined,
  ) {
    if (groupId === undefined) {
      throw new DomainError('groupId is required', 'BAD_REQUEST');
    }
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    if (groupId) {
      const group = await this.groups.findById(groupId);
      if (!group) {
        throw new DomainError(`Group "${groupId}" not found`, 'NOT_FOUND');
      }
    }
    await this.projects.updateGroupByName(projectName, groupId);
    const summary = await this.projectRead.getProjectSummary(projectName);
    if (!summary) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    return {
      id: summary.id,
      name: summary.name,
      createdAt: summary.createdAt,
      groupId: summary.groupId,
      groupName: summary.groupName,
      pendingCount: summary.pendingCount,
      testCount: summary.testCount,
      pending: summary.hasPendingComparisons,
    };
  }
```

- [ ] **Step 7: Extend the projects controller**

Modify `backend/src/modules/public/visualTest/review/presentation/controllers/projects.controller.ts`:

Add `Patch` to the existing `@nestjs/common` import and add:

```ts
import { UpdateProjectDto } from "@public/visualTest/review/presentation/dto/project.dto";
```

Change `create`:

```ts
  async create(@Body() dto: CreateProjectDto): Promise<ProjectDto> {
    const project = await this.projectService.create(dto.name, dto.groupId);
    return plainToInstance(ProjectDto, project, {
      excludeExtraneousValues: true,
    });
  }
```

Add:

```ts
  @Patch(':projectName')
  @ApiOperation({ summary: 'Move a project to another group' })
  @ApiOkResponse({ type: ProjectDto })
  async updateProject(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    const project = await this.projectService.updateProjectGroup(
      projectName,
      dto.groupId,
    );
    return plainToInstance(ProjectDto, project, {
      excludeExtraneousValues: true,
    });
  }
```

- [ ] **Step 8: Register the group repository in the module**

In `backend/src/modules/public/visualTest/review/review.module.ts`, `ProjectGroupRepository` is already provided from Task 2.

- [ ] **Step 9: Update the service/controller tests**

In `backend/test/unit/modules/public/visualTest/review/application/project.service.spec.ts`, add a mock:

```ts
let groups: Mocked<ProjectGroupRepository>;
groups = createMock<ProjectGroupRepository>();
// provider
{ provide: ProjectGroupRepository, useValue: groups },
```

Update `getAllWithPendingFlag` expectations to include `groupId`, `groupName`, `pendingCount`, `testCount`, `pending`. Update the `getWithLatestVariantStatuses` expected object to include `groupId: null, groupName: null`. Update the `create` test to expect `projects.create('my-project', null)` and the extra summary fields (`groupId: null`, `groupName: null`, `pendingCount: 0`, `testCount: 0`, `pending: false`).

Add:

```ts
it("moves a project to a group and returns counts", async () => {
  projects.findByName.mockResolvedValue({
    id: "proj-1",
    name: "checkout-ui",
    createdAt: new Date(),
    groupId: null,
  });
  groups.findById.mockResolvedValue({
    id: "g1",
    name: "Checkout",
    createdAt: new Date(),
  });
  projectRead.getProjectSummary.mockResolvedValue({
    id: "proj-1",
    name: "checkout-ui",
    createdAt: new Date(),
    groupId: "g1",
    groupName: "Checkout",
    pendingCount: 2,
    testCount: 4,
    hasPendingComparisons: true,
  });

  const result = await service.updateProjectGroup("checkout-ui", "g1");

  expect(projects.updateGroupByName).toHaveBeenCalledWith("checkout-ui", "g1");
  expect(result).toMatchObject({
    groupId: "g1",
    groupName: "Checkout",
    pendingCount: 2,
    testCount: 4,
    pending: true,
  });
});
```

In `backend/test/unit/modules/public/visualTest/review/presentation/controllers/projects.controller.spec.ts`, update the `create` test to expect `service.create('new-project', undefined)` and add:

```ts
it("moves a project to a group", async () => {
  projectService.updateProjectGroup.mockResolvedValue({
    id: "proj-1",
    name: "checkout-ui",
    createdAt: new Date(),
    groupId: "g1",
    groupName: "Checkout",
    pendingCount: 0,
    testCount: 0,
    pending: false,
  });
  const result = await controller.updateProject("checkout-ui", {
    groupId: "g1",
  });
  expect(result).toMatchObject({ groupId: "g1", groupName: "Checkout" });
});
```

- [ ] **Step 10: Run the tests**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/infrastructure/repositories/project-read.repository.spec.ts
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/project.service.spec.ts
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/presentation/controllers/projects.controller.spec.ts
NODE_ENV=test pnpm --filter ./backend test:e2e -- test/e2e/projects/groups.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/public/visualTest/review backend/src/modules/public/visualTest/core/infrastructure/repositories/prisma-project.repository.ts backend/test/unit backend/test/e2e/projects/groups.e2e-spec.ts
git commit -m "feat(backend): add project counts and group assignment"
```

### Task 4: Add the global pending-review read model

**Files:**

- Create: `backend/src/modules/public/visualTest/review/infrastructure/repositories/review-inbox.repository.ts`
- Create: `backend/src/modules/public/visualTest/review/application/review-inbox.service.ts`
- Create: `backend/src/modules/public/visualTest/review/presentation/controllers/review-inbox.controller.ts`
- Modify: `backend/src/modules/public/visualTest/review/presentation/dto/review-responses.dto.ts`
- Modify: `backend/src/modules/public/visualTest/review/review.module.ts`
- Test: `backend/test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts`
- Test: `backend/test/e2e/projects/review-inbox.e2e-spec.ts`

- [ ] **Step 1: Write the failing service test**

Create `backend/test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts`:

```ts
import type { Mocked } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ReviewInboxService } from "@public/visualTest/review/application/review-inbox.service";
import { ReviewInboxRepository } from "@public/visualTest/review/infrastructure/repositories/review-inbox.repository";
import { createMock } from "@test/utils/create-mock";
import { PaginationDto } from "@common/dto/pagination.dto";

describe("ReviewInboxService", () => {
  let service: ReviewInboxService;
  let inbox: Mocked<ReviewInboxRepository>;

  beforeEach(async () => {
    inbox = createMock<ReviewInboxRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewInboxService,
        { provide: ReviewInboxRepository, useValue: inbox },
      ],
    }).compile();
    service = module.get(ReviewInboxService);
  });

  it("maps the pending rows to review DTOs", async () => {
    inbox.findPending.mockResolvedValue({
      data: [
        {
          comparisonId: "c1",
          projectName: "checkout-ui",
          groupId: "g1",
          groupName: "Checkout",
          testName: "login",
          kind: "image",
          variant: {
            viewport: "1920x1080",
            browser: "Chrome",
            environment: "staging",
          },
          mismatchPixelCount: 12,
          mismatchPageCount: null,
          createdAt: new Date("2026-10-20T10:00:00Z"),
        },
      ],
      total: 1,
    });

    const result = await service.getPending(new PaginationDto());

    expect(result.data[0]).toMatchObject({
      comparisonId: "c1",
      projectName: "checkout-ui",
      groupName: "Checkout",
      testName: "login",
      mismatchPixelCount: 12,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Create the repository**

Create `backend/src/modules/public/visualTest/review/infrastructure/repositories/review-inbox.repository.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { findManyWithCount } from "@/prisma/find-many-with-count";
import type { Prisma } from "@/prisma/client";
import { PENDING_APPROVAL_STATUS_FILTER } from "@public/visualTest/core/domain/types/visual-test.types";
import { COMPARISON_INCLUDE } from "@public/visualTest/core/infrastructure/mappers/comparison.mapper";
import { variantFromRow } from "@public/visualTest/core/infrastructure/mappers/variant-row.mapper";

export interface PendingReviewRow {
  comparisonId: string;
  projectName: string;
  groupId: string | null;
  groupName: string | null;
  testName: string;
  kind: string;
  variant: { viewport: string; browser: string; environment: string };
  mismatchPixelCount: number;
  mismatchPageCount: number | null;
  createdAt: Date;
}

const INBOX_INCLUDE = {
  test: {
    select: {
      name: true,
      kind: true,
      project: {
        select: {
          name: true,
          group: { select: { id: true, name: true } },
        },
      },
    },
  },
  baseline: COMPARISON_INCLUDE.baseline,
} as const;

type InboxComparisonRow = Prisma.UnifiedComparisonGetPayload<{
  include: typeof INBOX_INCLUDE;
}>;

@Injectable()
export class ReviewInboxRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  async findPending(pagination?: {
    skip: number;
    take: number;
  }): Promise<{ data: PendingReviewRow[]; total: number }> {
    const { data, total } = await findManyWithCount<InboxComparisonRow>(
      this.client.unifiedComparison,
      {
        where: PENDING_APPROVAL_STATUS_FILTER,
        include: INBOX_INCLUDE,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: pagination?.skip,
        take: pagination?.take,
      },
    );

    return {
      data: data.map((row) => {
        const variant = variantFromRow(row.baseline);
        return {
          comparisonId: row.id,
          projectName: row.test.project.name,
          groupId: row.test.project.group?.id ?? null,
          groupName: row.test.project.group?.name ?? null,
          testName: row.test.name,
          kind: row.test.kind,
          variant: {
            viewport: variant.viewport,
            browser: variant.browser,
            environment: variant.environment,
          },
          mismatchPixelCount: row.mismatchPixelCount,
          mismatchPageCount: row.mismatchPageCount ?? null,
          createdAt: row.createdAt,
        };
      }),
      total,
    };
  }
}
```

- [ ] **Step 4: Add the DTO**

Append to `backend/src/modules/public/visualTest/review/presentation/dto/review-responses.dto.ts`:

```ts
export class PendingReviewDto {
  @ApiProperty()
  @Expose()
  comparisonId!: string;

  @ApiProperty()
  @Expose()
  projectName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Expose()
  groupId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Expose()
  groupName?: string | null;

  @ApiProperty()
  @Expose()
  testName!: string;

  @ApiProperty({ example: "image" })
  @Expose()
  kind!: string;

  @ApiProperty({ type: () => VariantDto })
  @Type(() => VariantDto)
  @Expose()
  variant!: VariantDto;

  @ApiProperty()
  @Expose()
  mismatchPixelCount!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Expose()
  mismatchPageCount?: number | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;
}
```

- [ ] **Step 5: Create the service**

Create `backend/src/modules/public/visualTest/review/application/review-inbox.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { PaginationDto } from "@common/dto/pagination.dto";
import { paginatedQuery } from "@common/utils/paginated-query";
import { ReviewInboxRepository } from "@public/visualTest/review/infrastructure/repositories/review-inbox.repository";
import { PendingReviewDto } from "@public/visualTest/review/presentation/dto/review-responses.dto";

@Injectable()
export class ReviewInboxService {
  constructor(private readonly inbox: ReviewInboxRepository) {}

  async getPending(pagination: PaginationDto) {
    return paginatedQuery(
      (args) => this.inbox.findPending(args),
      pagination,
      (row) =>
        plainToInstance(PendingReviewDto, row, {
          excludeExtraneousValues: true,
        }),
    );
  }
}
```

- [ ] **Step 6: Create the controller**

Create `backend/src/modules/public/visualTest/review/presentation/controllers/review-inbox.controller.ts`:

```ts
import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PaginationDto } from "@common/dto/pagination.dto";
import { PaginatedResponseDto } from "@common/dto/paginated-response.dto";
import { ReviewInboxService } from "@public/visualTest/review/application/review-inbox.service";
import { PendingReviewDto } from "@public/visualTest/review/presentation/dto/review-responses.dto";

@ApiTags("Review")
@Controller("review")
export class ReviewInboxController {
  constructor(private readonly inbox: ReviewInboxService) {}

  @Get("pending")
  @ApiOperation({ summary: "List pending reviews across all projects" })
  @ApiOkResponse({ type: PaginatedResponseDto(PendingReviewDto) })
  async getPending(@Query() pagination: PaginationDto) {
    return this.inbox.getPending(pagination);
  }
}
```

- [ ] **Step 7: Register in the module**

In `backend/src/modules/public/visualTest/review/review.module.ts` add:

```ts
import { ReviewInboxController } from '@public/visualTest/review/presentation/controllers/review-inbox.controller';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { ReviewInboxRepository } from '@public/visualTest/review/infrastructure/repositories/review-inbox.repository';

// controllers
ReviewInboxController,
// providers
ReviewInboxService,
ReviewInboxRepository,
```

- [ ] **Step 8: Run the service test**

```bash
pnpm --filter ./backend test -- test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Write the e2e test**

Create `backend/test/e2e/projects/review-inbox.e2e-spec.ts`:

```ts
import { INestApplication } from "@nestjs/common";
import { TestApp } from "../_support/utils/test-app";
import { PrismaConnection } from "@/prisma/prisma-connection";
import { ComparisonStatus, TestStatus } from "@/prisma/client";
import { authRequest } from "../_support/utils/authenticated-request";

describe("Review inbox (e2e)", () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  it("returns pending reviews across projects, oldest first", async () => {
    const group = await prisma.projectGroup.create({
      data: { name: "Checkout" },
    });
    const project = await prisma.project.create({
      data: { name: "checkout-ui", groupId: group.id },
    });
    const test = await prisma.unifiedTest.create({
      data: {
        name: "login",
        projectId: project.id,
        status: TestStatus.PENDING_APPROVAL,
      },
    });
    const baseline = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: "BASELINE",
        imageHash: "base",
        imageUrl: "http://rustfs/base.png",
      },
    });
    await prisma.unifiedVariant.create({
      data: {
        testId: test.id,
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
        baselineId: baseline.id,
      },
    });
    const candidate = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: "CURRENT",
        imageHash: "curr",
        imageUrl: "http://rustfs/curr.png",
      },
    });
    const comparison = await prisma.unifiedComparison.create({
      data: {
        testId: test.id,
        baselineId: baseline.id,
        candidateId: candidate.id,
        mismatchPixelCount: 42,
        diffImageUrl: "http://rustfs/diff.png",
        status: ComparisonStatus.PENDING_APPROVAL,
      },
    });

    const res = await authRequest(app)
      .get("/api/v1/review/pending")
      .expect(200);

    expect(res.body.data).toEqual([
      expect.objectContaining({
        comparisonId: comparison.id,
        projectName: "checkout-ui",
        groupName: "Checkout",
        testName: "login",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 42,
      }),
    ]);
  });
});
```

- [ ] **Step 10: Run the e2e test**

```bash
NODE_ENV=test pnpm --filter ./backend test:e2e -- test/e2e/projects/review-inbox.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/public/visualTest/review backend/test/unit/modules/public/visualTest/review/application/review-inbox.service.spec.ts backend/test/e2e/projects/review-inbox.e2e-spec.ts
git commit -m "feat(backend): add global review inbox endpoint"
```

### Task 5: Regenerate and build the SDK

**Files:**

- Modify: generated `backend/swagger.json`, `client-sdk/**`

- [ ] **Step 1: Regenerate the SDK**

Run:

```bash
pnpm run sdk:generate
```

Expected: `backend/swagger.json` and `client-sdk/` update with group/inbox models and controllers.

- [ ] **Step 2: Verify the generated symbols**

Run:

```bash
grep -n "projectGroupsController\|reviewInboxController\|projectsControllerUpdateProject" client-sdk/sdk.gen.ts
cat client-sdk/models/ProjectGroupDto.gen.ts
cat client-sdk/models/PendingReviewDto.gen.ts
```

Expected: the four symbols exist and the DTOs contain `projectCount`, `groupId`, `groupName`, `pendingCount`, `testCount`, `comparisonId`.

If a generated name differs (for example `projectGroupsControllerRemove` vs `delete`), use the generated name in later tasks. Do not edit any `.gen.ts` file.

- [ ] **Step 3: Build the SDK**

```bash
pnpm run sdk:build
```

Expected: PASS.

- [ ] **Step 4: Commit generated output**

```bash
git add backend/swagger.json client-sdk
git commit -m "chore(sdk): regenerate client for groups and review inbox"
```

---

## Phase 2: Frontend data layer

### Task 6: Add the groups domain and composables

**Files:**

- Create: `frontend/src/domains/groups/group.model.ts`
- Create: `frontend/src/domains/groups/group.mapper.ts`
- Create: `frontend/src/domains/groups/query-keys.ts`
- Create: `frontend/src/domains/groups/__tests__/group.mapper.test.ts`
- Create: `frontend/src/composables/useGroups.ts`
- Test: `frontend/src/domains/groups/__tests__/group.mapper.test.ts`

- [ ] **Step 1: Write the failing mapper test**

Create `frontend/src/domains/groups/__tests__/group.mapper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapProjectGroup, mapProjectGroups } from "../group.mapper";

describe("group mapper", () => {
  it("maps a group DTO", () => {
    expect(
      mapProjectGroup({
        id: "g1",
        name: "Checkout",
        createdAt: "2026-10-20T10:00:00.000Z",
        projectCount: 3,
      }),
    ).toEqual({
      id: "g1",
      name: "Checkout",
      createdAt: "2026-10-20T10:00:00.000Z",
      projectCount: 3,
    });
  });

  it("defaults projectCount to 0 and omits missing createdAt", () => {
    expect(mapProjectGroup({ id: "g1", name: "Checkout" })).toEqual({
      id: "g1",
      name: "Checkout",
      projectCount: 0,
    });
  });

  it("maps an undefined list to an empty list", () => {
    expect(mapProjectGroups(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test -- src/domains/groups/__tests__/group.mapper.test.ts
```

Expected: FAIL because the mapper does not exist.

- [ ] **Step 3: Create the model, mapper, and query keys**

Create `frontend/src/domains/groups/group.model.ts`:

```ts
export interface ProjectGroup {
  id: string;
  name: string;
  createdAt?: string;
  projectCount: number;
}
```

Create `frontend/src/domains/groups/group.mapper.ts`:

```ts
import type { ProjectGroupDto } from "@sdk";
import type { ProjectGroup } from "./group.model";

export function mapProjectGroup(dto: ProjectGroupDto): ProjectGroup {
  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    ...(dto.createdAt ? { createdAt: dto.createdAt } : {}),
    projectCount: dto.projectCount ?? 0,
  };
}

export function mapProjectGroups(
  dtos: ProjectGroupDto[] | undefined = [],
): ProjectGroup[] {
  return dtos.map(mapProjectGroup);
}
```

Create `frontend/src/domains/groups/query-keys.ts`:

```ts
export const groupQueryKeys = {
  all: () => ["groups"] as const,
  list: () => [...groupQueryKeys.all(), "list"] as const,
} as const;
```

- [ ] **Step 4: Run the mapper test**

```bash
pnpm --filter ./frontend test -- src/domains/groups/__tests__/group.mapper.test.ts
```

Expected: PASS.

- [ ] **Step 5: Create the composables**

Create `frontend/src/composables/useGroups.ts`:

```ts
import {
  projectGroupsControllerCreate,
  projectGroupsControllerFindAll,
  projectGroupsControllerRemove,
  projectGroupsControllerRename,
  type ProjectGroupDto,
} from "@sdk";
import type { QueryClient } from "@tanstack/vue-query";
import { groupQueryKeys } from "@/domains/groups/query-keys";
import { mapProjectGroups } from "@/domains/groups/group.mapper";
import { useDomainQuery } from "@/composables/useDomainQuery";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { unwrapSdkData } from "@/lib/sdk";
import {
  invalidateProjectsForGroupChange,
  invalidateReviewInbox,
} from "@/lib/invalidation";

export function useGroupsQuery() {
  return useDomainQuery({
    queryKey: groupQueryKeys.list(),
    queryFn: async () => {
      const response = await projectGroupsControllerFindAll();
      return mapProjectGroups(unwrapSdkData<ProjectGroupDto[]>(response) ?? []);
    },
  });
}

export function useCreateGroup() {
  return useSdkMutation<ProjectGroupDto, { name: string }>({
    mutationFn: (body) => projectGroupsControllerCreate({ body }),
    successMessage: "Group created",
    errorMessage: "Could not create group",
    invalidate: (client: QueryClient) => {
      client.invalidateQueries({ queryKey: groupQueryKeys.all() });
    },
  });
}

export function useRenameGroup() {
  return useSdkMutation<ProjectGroupDto, { id: string; name: string }>({
    mutationFn: ({ id, name }) =>
      projectGroupsControllerRename({ path: { id }, body: { name } }),
    successMessage: "Group renamed",
    errorMessage: "Could not rename group",
    invalidate: (client) => invalidateProjectsForGroupChange(client),
  });
}

export function useDeleteGroup() {
  return useSdkMutation<unknown, string>({
    mutationFn: (id) => projectGroupsControllerRemove({ path: { id } }),
    successMessage: "Group deleted",
    errorMessage: "Could not delete group",
    invalidate: (client) => {
      invalidateProjectsForGroupChange(client);
      invalidateReviewInbox(client);
    },
  });
}
```

- [ ] **Step 6: Add the invalidation helpers**

Modify `frontend/src/lib/invalidation.ts`:

```ts
import { groupQueryKeys } from "@/domains/groups/query-keys";
import { reviewInboxQueryKeys } from "@/domains/pending-tests/query-keys";

export function invalidateReviewInbox(client: QueryClient) {
  client.invalidateQueries({ queryKey: reviewInboxQueryKeys.all() });
}

export function invalidateProjectsForGroupChange(client: QueryClient) {
  client.invalidateQueries({ queryKey: groupQueryKeys.all() });
  invalidateProjectList(client);
  invalidateReviewInbox(client);
}
```

Update `invalidateProjectDetail` and `invalidateProjectList` to also invalidate the inbox:

```ts
export function invalidateProjectDetail(
  client: QueryClient,
  projectName: string,
) {
  client.invalidateQueries({ queryKey: projectQueryKeys.detail(projectName) });
  client.invalidateQueries({
    queryKey: pendingTestQueryKeys.list(projectName),
  });
  invalidateReviewInbox(client);
}

export function invalidateProjectList(client: QueryClient) {
  client.invalidateQueries({ queryKey: projectQueryKeys.all() });
  client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
  invalidateReviewInbox(client);
}
```

- [ ] **Step 7: Run frontend typecheck**

```bash
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/groups frontend/src/composables/useGroups.ts frontend/src/lib/invalidation.ts
git commit -m "feat(frontend): add groups domain"
```

### Task 7: Extend projects with groups and counts

**Files:**

- Modify: `frontend/src/domains/projects/project.model.ts`
- Modify: `frontend/src/domains/projects/project.mapper.ts`
- Modify: `frontend/src/domains/projects/__tests__/project.mapper.test.ts`
- Create: `frontend/src/domains/projects/group-projects-by-group.ts`
- Create: `frontend/src/domains/projects/__tests__/group-projects-by-group.test.ts`

- [ ] **Step 1: Write the failing grouping test**

Create `frontend/src/domains/projects/__tests__/group-projects-by-group.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupProjectsByGroup } from "../group-projects-by-group";
import type { Project } from "../project.model";

const project = (overrides: Partial<Project>): Project => ({
  id: "p",
  name: "p",
  hasPendingTests: false,
  ...overrides,
});

describe("groupProjectsByGroup", () => {
  it("sorts groups alphabetically and puts Unassigned last", () => {
    const sections = groupProjectsByGroup([
      project({ id: "1", name: "b", groupId: "g2", groupName: "Beta" }),
      project({ id: "2", name: "u", groupId: null, groupName: null }),
      project({ id: "3", name: "a", groupId: "g1", groupName: "Alpha" }),
    ]);

    expect(sections.map((s) => s.name)).toEqual([
      "Alpha",
      "Beta",
      "Unassigned",
    ]);
  });

  it("sorts projects by pending count then name", () => {
    const sections = groupProjectsByGroup([
      project({
        id: "1",
        name: "z",
        groupId: "g1",
        groupName: "Alpha",
        pendingCount: 0,
      }),
      project({
        id: "2",
        name: "b",
        groupId: "g1",
        groupName: "Alpha",
        pendingCount: 2,
      }),
      project({
        id: "3",
        name: "a",
        groupId: "g1",
        groupName: "Alpha",
        pendingCount: 0,
      }),
    ]);

    expect(sections[0].projects.map((p) => p.name)).toEqual(["b", "a", "z"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test -- src/domains/projects/__tests__/group-projects-by-group.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Extend the project model**

Modify `frontend/src/domains/projects/project.model.ts`:

```ts
export interface Project {
  id: string;
  name: string;
  hasPendingTests: boolean;
  groupId?: string | null;
  groupName?: string | null;
  pendingCount?: number;
  testCount?: number;
  visualTests?: VisualTestItem[];
  createdAt?: string;
}
```

- [ ] **Step 4: Extend the project mapper**

Modify `frontend/src/domains/projects/project.mapper.ts`:

```ts
export function mapProject(dto: ProjectDto): Project {
  const visualTests = (dto.visualTests ?? []).map(mapVisualTest);
  const hasPending =
    dto.pending ?? visualTests.some((t) => isPendingApproval(t.latestStatus));
  const testCount =
    dto.testCount ??
    (dto.visualTests
      ? new Set(dto.visualTests.map((t) => t.name ?? "")).size
      : 0);

  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    hasPendingTests: hasPending,
    groupId: dto.groupId ?? null,
    groupName: dto.groupName ?? null,
    pendingCount: dto.pendingCount ?? (hasPending ? 1 : 0),
    testCount,
    visualTests,
    createdAt: dto.createdAt,
  };
}
```

- [ ] **Step 5: Add the grouping helper**

Create `frontend/src/domains/projects/group-projects-by-group.ts`:

```ts
import type { Project } from "./project.model";

export interface ProjectGroupSection {
  id: string | null;
  name: string;
  projects: Project[];
}

const UNASSIGNED = "Unassigned";

export function groupProjectsByGroup(
  projects: readonly Project[],
): ProjectGroupSection[] {
  const sections = new Map<string, ProjectGroupSection>();

  for (const project of projects) {
    const id = project.groupId ?? null;
    const name = project.groupName ?? UNASSIGNED;
    const key = id ?? "__unassigned__";
    const section = sections.get(key) ?? { id, name, projects: [] };
    section.projects.push(project);
    sections.set(key, section);
  }

  return [...sections.values()]
    .map((section) => ({
      ...section,
      projects: [...section.projects].sort(
        (a, b) =>
          (b.pendingCount ?? 0) - (a.pendingCount ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => {
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      return a.name.localeCompare(b.name);
    });
}
```

- [ ] **Step 6: Update the mapper test**

Add to `frontend/src/domains/projects/__tests__/project.mapper.test.ts`:

```ts
it("maps group and counts", () => {
  const result = mapProject({
    id: "1",
    name: "p",
    groupId: "g1",
    groupName: "Checkout",
    pendingCount: 2,
    testCount: 5,
  });
  expect(result).toMatchObject({
    groupId: "g1",
    groupName: "Checkout",
    pendingCount: 2,
    testCount: 5,
  });
});
```

- [ ] **Step 7: Run the tests**

```bash
pnpm --filter ./frontend test -- src/domains/projects/__tests__/project.mapper.test.ts src/domains/projects/__tests__/group-projects-by-group.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/projects
git commit -m "feat(frontend): add project groups and counts"
```

### Task 8: Add the review inbox domain and query

**Files:**

- Create: `frontend/src/domains/pending-tests/review-inbox.model.ts`
- Create: `frontend/src/domains/pending-tests/review-inbox.mapper.ts`
- Create: `frontend/src/domains/pending-tests/group-review-inbox.ts`
- Create: `frontend/src/domains/pending-tests/__tests__/review-inbox.mapper.test.ts`
- Create: `frontend/src/domains/pending-tests/__tests__/group-review-inbox.test.ts`
- Modify: `frontend/src/domains/pending-tests/query-keys.ts`
- Create: `frontend/src/composables/useReviewInbox.ts`
- Create: `frontend/src/lib/format-date.ts`
- Create: `frontend/src/__tests__/format-date.test.ts`

- [ ] **Step 1: Write the failing grouping test**

Create `frontend/src/domains/pending-tests/__tests__/group-review-inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupReviewInbox } from "../group-review-inbox";
import type { ReviewInboxItem } from "../review-inbox.model";

const item = (overrides: Partial<ReviewInboxItem>): ReviewInboxItem => ({
  comparisonId: "c",
  projectName: "p",
  testName: "t",
  kind: "image",
  mismatchPixelCount: 1,
  createdAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

describe("groupReviewInbox", () => {
  it("groups by group then project, Unassigned last", () => {
    const sections = groupReviewInbox([
      item({
        comparisonId: "1",
        projectName: "z",
        groupId: "g1",
        groupName: "Alpha",
      }),
      item({
        comparisonId: "2",
        projectName: "u",
        groupId: null,
        groupName: null,
      }),
      item({
        comparisonId: "3",
        projectName: "a",
        groupId: "g1",
        groupName: "Alpha",
      }),
    ]);

    expect(sections.map((s) => s.name)).toEqual(["Alpha", "Unassigned"]);
    expect(sections[0].projects.map((p) => p.projectName)).toEqual(["a", "z"]);
  });

  it("sorts reviews oldest first", () => {
    const sections = groupReviewInbox([
      item({ comparisonId: "new", createdAt: "2026-10-22T10:00:00.000Z" }),
      item({ comparisonId: "old", createdAt: "2026-10-20T10:00:00.000Z" }),
    ]);
    expect(sections[0].projects[0].items.map((i) => i.comparisonId)).toEqual([
      "old",
      "new",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test -- src/domains/pending-tests/__tests__/group-review-inbox.test.ts
```

Expected: FAIL because the model/helper does not exist.

- [ ] **Step 3: Create the model and mapper**

Create `frontend/src/domains/pending-tests/review-inbox.model.ts`:

```ts
import type { TestKind } from "@/domains/test-kind";

export interface ReviewInboxItem {
  comparisonId: string;
  projectName: string;
  groupId?: string | null;
  groupName?: string | null;
  testName: string;
  kind?: TestKind;
  viewport?: string;
  browser?: string;
  environment?: string;
  mismatchPixelCount: number;
  mismatchPageCount?: number | null;
  createdAt: string;
}
```

Create `frontend/src/domains/pending-tests/review-inbox.mapper.ts`:

```ts
import type { PendingReviewDto } from "@sdk";
import { isTestKind, type TestKind } from "@/domains/test-kind";
import type { ReviewInboxItem } from "./review-inbox.model";

function toKind(kind: string | undefined): TestKind | undefined {
  return isTestKind(kind) ? kind : undefined;
}

export function mapReviewInboxItem(dto: PendingReviewDto): ReviewInboxItem {
  return {
    comparisonId: dto.comparisonId,
    projectName: dto.projectName,
    groupId: dto.groupId ?? null,
    groupName: dto.groupName ?? null,
    testName: dto.testName,
    kind: toKind(dto.kind),
    ...(dto.variant ?? {}),
    mismatchPixelCount: dto.mismatchPixelCount,
    mismatchPageCount: dto.mismatchPageCount ?? null,
    createdAt: dto.createdAt,
  };
}

export function mapReviewInbox(
  dtos: PendingReviewDto[] | undefined = [],
): ReviewInboxItem[] {
  return dtos.map(mapReviewInboxItem);
}
```

- [ ] **Step 4: Create the grouping helper**

Create `frontend/src/domains/pending-tests/group-review-inbox.ts`:

```ts
import type { ReviewInboxItem } from "./review-inbox.model";

export interface InboxProjectSection {
  projectName: string;
  groupId: string | null;
  groupName: string;
  items: ReviewInboxItem[];
}

export interface InboxGroupSection {
  id: string | null;
  name: string;
  projects: InboxProjectSection[];
}

const UNASSIGNED = "Unassigned";

export function groupReviewInbox(
  items: readonly ReviewInboxItem[],
): InboxGroupSection[] {
  const groups = new Map<string, InboxGroupSection>();

  for (const item of items) {
    const groupId = item.groupId ?? null;
    const groupName = item.groupName ?? UNASSIGNED;
    const groupKey = groupId ?? "__unassigned__";
    const group =
      groups.get(groupKey) ??
      ({
        id: groupId,
        name: groupName,
        projects: [],
      } satisfies InboxGroupSection);
    const project = group.projects.find(
      (p) => p.projectName === item.projectName,
    ) ?? { projectName: item.projectName, groupId, groupName, items: [] };
    if (!group.projects.includes(project)) group.projects.push(project);
    project.items.push(item);
    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      projects: group.projects
        .map((project) => ({
          ...project,
          items: [...project.items].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          ),
        }))
        .sort(
          (a, b) =>
            new Date(a.items[0]?.createdAt ?? 0).getTime() -
              new Date(b.items[0]?.createdAt ?? 0).getTime() ||
            a.projectName.localeCompare(b.projectName),
        ),
    }))
    .sort((a, b) => {
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      return a.name.localeCompare(b.name);
    });
}
```

- [ ] **Step 5: Add query keys and inbox query**

Modify `frontend/src/domains/pending-tests/query-keys.ts`:

```ts
export const reviewInboxQueryKeys = {
  all: () => ["review-inbox"] as const,
  list: () => [...reviewInboxQueryKeys.all(), "list"] as const,
} as const;

export const pendingTestQueryKeys = {
  // existing content
} as const;
```

Create `frontend/src/composables/useReviewInbox.ts`:

```ts
import { computed } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { reviewInboxControllerGetPending, type PendingReviewDto } from "@sdk";
import { usePaginatedListQuery } from "@/composables/useDomainQuery";
import { reviewInboxQueryKeys } from "@/domains/pending-tests/query-keys";
import { mapReviewInbox } from "@/domains/pending-tests/review-inbox.mapper";
import { groupReviewInbox } from "@/domains/pending-tests/group-review-inbox";
import type { ReviewInboxItem } from "@/domains/pending-tests/review-inbox.model";

export function useReviewInboxQuery() {
  return usePaginatedListQuery<PendingReviewDto, ReviewInboxItem>({
    queryKey: reviewInboxQueryKeys.list(),
    fetchPage: (skip, take) =>
      reviewInboxControllerGetPending({ query: { skip, take } }),
    map: mapReviewInbox,
  });
}

export function useReviewInboxSections() {
  const query = useReviewInboxQuery();
  const sections = computed(() => groupReviewInbox(query.data.value ?? []));
  return { ...query, sections };
}

export async function withReviewInboxItemRemoved(
  client: QueryClient,
  comparisonId: string,
): Promise<{ restore: () => void }> {
  const key = reviewInboxQueryKeys.list();
  await client.cancelQueries({ queryKey: key });
  const previous = client.getQueryData<ReviewInboxItem[]>(key);
  client.setQueryData<ReviewInboxItem[]>(key, (old) =>
    (old ?? []).filter((item) => item.comparisonId !== comparisonId),
  );
  return {
    restore: () => {
      if (previous) {
        client.setQueryData(key, previous);
      }
    },
  };
}
```

- [ ] **Step 6: Add the date helper**

- [ ] **Step 6: Add the date helper**

Create `frontend/src/lib/format-date.ts`:

```ts
export function formatRelativeAge(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMinutes = Math.round((then - now.getTime()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }
  return formatter.format(Math.round(diffHours / 24), "day");
}
```

Create `frontend/src/__tests__/format-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatRelativeAge } from "@/lib/format-date";

describe("formatRelativeAge", () => {
  it("formats minutes and days", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(formatRelativeAge("2026-10-22T11:30:00Z", now)).toContain("30");
    expect(formatRelativeAge("2026-10-20T12:00:00Z", now)).toContain("2");
  });

  it("returns a dash for an invalid date", () => {
    expect(formatRelativeAge("not-a-date")).toBe("—");
  });
});
```

- [ ] **Step 7: Run the tests**

```bash
pnpm --filter ./frontend test -- src/domains/pending-tests/__tests__/group-review-inbox.test.ts src/__tests__/format-date.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/pending-tests frontend/src/composables/useReviewInbox.ts frontend/src/lib/format-date.ts frontend/src/__tests__/format-date.test.ts
git commit -m "feat(frontend): add review inbox domain"
```

---

## Phase 3: Frontend shell and views

### Task 9: Add the app shell, sidebar, and routes

**Files:**

- Create: `frontend/src/components/AppSidebar.vue`
- Create: `frontend/src/components/AppShell.vue`
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/AppShell.story.ts`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/composables/useAuth.ts`
- Modify: `frontend/src/lib/test-ids.ts`

- [ ] **Step 1: Add test ids**

Add to `frontend/src/lib/test-ids.ts`:

```ts
  appSidebar: "app-sidebar",
  navInbox: "nav-inbox",
  navProjects: "nav-projects",
  navGroups: "nav-groups",
  inboxBadge: "inbox-badge",
  reviewInbox: "review-inbox",
  inboxProjectSection: "inbox-project-section",
  inboxItem: "inbox-item",
  reviewProjectButton: "review-project-button",
  groupsTable: "groups-table",
  groupRow: "group-row",
  groupProjectCount: "group-project-count",
  newGroup: "new-group",
  groupNameInput: "group-name-input",
  groupFormSubmit: "group-form-submit",
  newProject: "new-project",
  projectNameInput: "project-name-input",
  projectGroupSelect: "project-group-select",
  projectFormSubmit: "project-form-submit",
  moveProject: "move-project",
  moveProjectSelect: "move-project-select",
  moveProjectSubmit: "move-project-submit",
  projectGroupBadge: "project-group-badge",
  projectPendingCount: "project-pending-count",
  projectTestCount: "project-test-count",
  filterKind: "filter-kind",
  reviewProgress: "review-progress",
  shortcutsHint: "shortcuts-hint",
  appShell: "app-shell",
```

- [ ] **Step 2: Create the sidebar**

Create `frontend/src/components/AppSidebar.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { Inbox, LayoutGrid, Users } from "@lucide/vue";
import { useTheme } from "@/composables/useTheme";
import { useMeQuery, useLogout } from "@/composables/useAuth";
import { useReviewInboxQuery } from "@/composables/useReviewInbox";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "@lucide/vue";
import { TEST_ID } from "@/lib/test-ids";

const route = useRoute();
const { theme, toggle } = useTheme();
const { data: user } = useMeQuery();
const { mutate: logout } = useLogout();
const { data: pending } = useReviewInboxQuery();

const pendingCount = computed(() => pending.value?.length ?? 0);

const onInbox = computed(() => route.name === "review-inbox");
const onProjects = computed(() => route.path.startsWith("/projects"));
const onGroups = computed(() => route.path.startsWith("/groups"));
</script>

<template>
  <aside
    class="w-full border-b bg-card/40 md:min-h-screen md:w-60 md:border-b-0 md:border-r"
    :data-testid="TEST_ID.appSidebar"
  >
    <div class="flex items-center justify-between px-4 py-3 md:block">
      <RouterLink to="/" class="text-sm font-semibold tracking-tight">
        Visual Regression
      </RouterLink>
    </div>

    <nav
      class="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3 md:pb-0"
      aria-label="Main"
    >
      <RouterLink
        to="/"
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="{ 'bg-muted text-foreground': onInbox }"
        :aria-current="onInbox ? 'page' : undefined"
        :data-testid="TEST_ID.navInbox"
      >
        <Inbox class="h-4 w-4" />
        Inbox
        <span
          v-if="pendingCount > 0"
          class="ml-auto rounded-full bg-status-warning/15 px-1.5 py-0.5 text-xs text-status-warning"
          :data-testid="TEST_ID.inboxBadge"
        >
          {{ pendingCount }}
        </span>
      </RouterLink>

      <RouterLink
        to="/projects"
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="{ 'bg-muted text-foreground': onProjects }"
        :aria-current="onProjects ? 'page' : undefined"
        :data-testid="TEST_ID.navProjects"
      >
        <LayoutGrid class="h-4 w-4" />
        Projects
      </RouterLink>

      <RouterLink
        to="/groups"
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="{ 'bg-muted text-foreground': onGroups }"
        :aria-current="onGroups ? 'page' : undefined"
        :data-testid="TEST_ID.navGroups"
      >
        <Users class="h-4 w-4" />
        Groups
      </RouterLink>
    </nav>

    <div
      v-if="user"
      class="flex items-center justify-between gap-2 border-t px-3 py-3"
    >
      <span
        class="truncate text-sm text-muted-foreground"
        :data-testid="TEST_ID.currentUser"
      >
        {{ user.username }}
      </span>
      <div class="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          :aria-label="
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          "
          :data-testid="TEST_ID.themeToggle"
          @click="toggle"
        >
          <Sun v-if="theme === 'dark'" class="h-4 w-4" />
          <Moon v-else class="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :data-testid="TEST_ID.logout"
          @click="logout"
        >
          Log out
        </Button>
      </div>
    </div>
  </aside>
</template>
```

- [ ] **Step 3: Create the shell**

Create `frontend/src/components/AppShell.vue`:

```vue
<template>
  <div
    class="min-h-screen"
    :class="{ 'md:flex': !isLogin }"
    :data-testid="TEST_ID.appShell"
  >
    <AppSidebar v-if="!isLogin" />
    <main class="p-4 md:p-6" :class="{ 'flex-1': !isLogin }">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>
  </div>
  <Toaster />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppSidebar from "@/components/AppSidebar.vue";
import ErrorBoundary from "@/components/ErrorBoundary.vue";
import { Toaster } from "@/components/ui/sonner";
import { TEST_ID } from "@/lib/test-ids";

const route = useRoute();
const isLogin = computed(() => route.name === "login");
</script>
```

- [ ] **Step 4: Replace App.vue**

Replace `frontend/src/App.vue` with:

```vue
<template>
  <AppShell />
</template>

<script setup lang="ts">
import AppShell from "@/components/AppShell.vue";
</script>
```

- [ ] **Step 5: Update the AppShell story**

Replace `frontend/src/AppShell.story.ts` with:

```ts
import { defineComponent, h } from "vue";
import { useRouter } from "vue-router";

import AppShellComponent from "@/components/AppShell.vue";

// The quality case `AppShell/AppShell` keeps working because the export name
// stays `AppShell`.
export const AppShell = defineComponent(
  (props: { initialRoute?: string }) => {
    const router = useRouter();
    if (props.initialRoute) {
      void router.push(props.initialRoute);
    }
    return () => h(AppShellComponent);
  },
  { props: ["initialRoute"] },
);
```

- [ ] **Step 6: Update the router**

Replace `frontend/src/router/index.ts` route entries:

```ts
import InboxView from "@/views/InboxView.vue";
import GroupsView from "@/views/GroupsView.vue";
// keep existing imports

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { requiresAuth: false },
  },
  {
    path: "/",
    name: "review-inbox",
    component: InboxView,
    meta: { requiresAuth: true },
  },
  {
    path: "/projects",
    name: "project-list",
    component: ProjectsView,
    meta: { requiresAuth: true },
  },
  {
    path: "/groups",
    name: "groups",
    component: GroupsView,
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName",
    name: "project-detail",
    component: ProjectDetailView,
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName/tests/:testName",
    name: "test-detail",
    component: TestDetailDispatcher,
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName/done",
    name: "approval-done",
    component: ApprovalDoneView,
    meta: { requiresAuth: true },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@/views/NotFoundView.vue"),
  },
];
```

- [ ] **Step 7: Move focus to the page heading after navigation**

Add `nextTick` to the top-level Vue import in `frontend/src/router/index.ts`:

```ts
import { nextTick } from "vue";
```

Then add after `router.beforeEach(authGuard)`:

```ts
router.afterEach(async () => {
  await nextTick();
  const heading = document.querySelector<HTMLElement>("main h1, main h2");
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus();
});
```

This gives keyboard and screen-reader users a stable landing point on every route change without changing the visual headings.

- [ ] **Step 8: Redirect login and 404 to the intended homes**

In `frontend/src/composables/useAuth.ts`, change the login success push:

```ts
router.push({ name: "review-inbox" });
```

Update the matching assertions in `frontend/src/__tests__/useAuth.test.ts` and `frontend/src/__tests__/LoginView.test.ts`:

```ts
expect(push).toHaveBeenCalledWith({ name: "review-inbox" });
```

Keep logout at `login`. `ApprovalDoneView` and `NotFoundView` keep `project-list`; they now go to `/projects`, which is correct.

- [ ] **Step 9: Defer typecheck until the views exist**

The router in this task imports `InboxView.vue` and `GroupsView.vue`, which are
created in Tasks 10 and 12. Run `pnpm --filter ./frontend typecheck` after both
tasks, then continue with this commit.

- [ ] **Step 10: Commit after views exist**

```bash
git add frontend/src/components/AppSidebar.vue frontend/src/components/AppShell.vue frontend/src/App.vue frontend/src/AppShell.story.ts frontend/src/router/index.ts frontend/src/composables/useAuth.ts frontend/src/lib/test-ids.ts
git commit -m "feat(frontend): add app shell and routes"
```

### Task 10: Add the form dialog and Groups page

**Files:**

- Create: `frontend/src/components/FormDialog.vue`
- Create: `frontend/src/components/groups/GroupFormDialog.vue`
- Create: `frontend/src/views/GroupsView.vue`
- Create: `frontend/src/views/GroupsView.story.ts`
- Test: `frontend/tests/ct/groups.spec.ts`
- Test: `frontend/tests/ct/mocks/groups.mocks.ts`

- [ ] **Step 1: Create the mock data**

Create `frontend/tests/ct/mocks/groups.mocks.ts`:

```ts
export const GROUPS_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "g1",
      name: "Checkout",
      createdAt: "2026-10-20T10:00:00.000Z",
      projectCount: 2,
    },
    {
      id: "g2",
      name: "Admin",
      createdAt: "2026-10-20T10:00:00.000Z",
      projectCount: 1,
    },
  ]),
};

export const GROUPS_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([]),
};
```

- [ ] **Step 2: Write the failing CT test**

Create `frontend/tests/ct/groups.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
import { TEST_ID } from "@/lib/test-ids";

test.describe("Groups", () => {
  test("lists groups with project counts", async ({ mount, page }) => {
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);

    const component = await mount("views/GroupsView/Groups");

    await expect(component.getByTestId(TEST_ID.groupRow)).toHaveCount(2);
    await expect(component).toContainText("Checkout");
    await expect(component).toContainText("2");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test-ct -- tests/ct/groups.spec.ts
```

Expected: FAIL because the story/view does not exist.

- [ ] **Step 4: Create the form dialog**

Create `frontend/src/components/FormDialog.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { Button } from "@/components/ui/button";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    pending?: boolean;
  }>(),
  {
    description: "",
    confirmText: "Save",
    cancelText: "Cancel",
    pending: false,
  },
);

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit"): void;
  (e: "cancel"): void;
}>();

const modelOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
</script>

<template>
  <DialogRoot v-model:open="modelOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">{{ title }}</DialogTitle>
          <DialogDescription
            v-if="description"
            class="text-sm text-muted-foreground"
          >
            {{ description }}
          </DialogDescription>
        </div>

        <form class="space-y-4" @submit.prevent="emit('submit')">
          <slot />

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose as-child>
              <Button
                type="button"
                variant="outline"
                :disabled="pending"
                @click="emit('cancel')"
              >
                {{ cancelText }}
              </Button>
            </DialogClose>
            <Button type="submit" :disabled="pending">
              {{ pending ? "Saving…" : confirmText }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
```

- [ ] **Step 5: Create the group form dialog**

Create `frontend/src/components/groups/GroupFormDialog.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import { Input } from "@/components/ui/input";
import FormDialog from "@/components/FormDialog.vue";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { ProjectGroup } from "@/domains/groups/group.model";

const props = defineProps<{
  open: boolean;
  group?: ProjectGroup | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", name: string): void;
}>();

const name = ref("");

watch(
  () => [props.open, props.group?.name],
  () => {
    name.value = props.group?.name ?? "";
  },
  { immediate: true },
);
</script>

<template>
  <FormDialog
    :open="open"
    :title="group ? 'Rename group' : 'New group'"
    :description="
      group
        ? 'Update the display name.'
        : 'Groups organize projects. They do not restrict access.'
    "
    :pending="pending"
    @update:open="emit('update:open', $event)"
    @submit="emit('submit', name.trim())"
  >
    <label class="block space-y-1 text-sm">
      <span>Name</span>
      <Input v-model="name" :data-testid="TEST_ID.groupNameInput" />
    </label>
    <p v-if="error" class="text-sm text-destructive">
      {{ sdkErrorMessage(error, "Could not save group") }}
    </p>
    <button
      type="submit"
      class="hidden"
      :data-testid="TEST_ID.groupFormSubmit"
    />
  </FormDialog>
</template>
```

- [ ] **Step 6: Create the Groups view**

Create `frontend/src/views/GroupsView.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  useGroupsQuery,
  useCreateGroup,
  useRenameGroup,
  useDeleteGroup,
} from "@/composables/useGroups";
import { Button } from "@/components/ui/button";
import GroupFormDialog from "@/components/groups/GroupFormDialog.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import AsyncState from "@/components/AsyncState.vue";
import { TEST_ID } from "@/lib/test-ids";
import type { ProjectGroup } from "@/domains/groups/group.model";

const { data: groups, isLoading, error, refetch } = useGroupsQuery();
const createGroup = useCreateGroup();
const renameGroup = useRenameGroup();
const deleteGroup = useDeleteGroup();

const formOpen = ref(false);
const editing = ref<ProjectGroup | null>(null);
const deleteOpen = ref(false);
const pendingDelete = ref<ProjectGroup | null>(null);

const formPending = computed(
  () => createGroup.isPending.value || renameGroup.isPending.value,
);
const formError = computed(
  () => createGroup.error.value ?? renameGroup.error.value,
);
const deletePending = computed(() => deleteGroup.isPending.value);

function openCreate() {
  editing.value = null;
  formOpen.value = true;
}
function openRename(group: ProjectGroup) {
  editing.value = group;
  formOpen.value = true;
}
function submit(name: string) {
  if (!name) return;
  const close = { onSuccess: () => (formOpen.value = false) };
  if (editing.value) {
    renameGroup.mutate({ id: editing.value.id, name }, close);
  } else {
    createGroup.mutate({ name }, close);
  }
}
function requestDelete(group: ProjectGroup) {
  pendingDelete.value = group;
  deleteOpen.value = true;
}
function confirmDelete() {
  if (!pendingDelete.value) return;
  deleteGroup.mutate(pendingDelete.value.id, {
    onSuccess: () => {
      deleteOpen.value = false;
      pendingDelete.value = null;
    },
  });
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight">Groups</h1>
      <Button type="button" :data-testid="TEST_ID.newGroup" @click="openCreate">
        New group
      </Button>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load groups"
      :retry="refetch"
      :empty="(groups ?? []).length === 0"
      empty-title="No groups yet"
      empty-description="Create a group to organize projects."
    >
      <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          v-for="group in groups"
          :key="group.id"
          class="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          :data-testid="TEST_ID.groupRow"
        >
          <div>
            <p class="font-medium">{{ group.name }}</p>
            <p
              class="text-sm text-muted-foreground"
              :data-testid="TEST_ID.groupProjectCount"
            >
              {{ group.projectCount }} projects
            </p>
          </div>
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="openRename(group)"
            >
              Rename
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              @click="requestDelete(group)"
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </AsyncState>

    <GroupFormDialog
      v-model:open="formOpen"
      :group="editing"
      :pending="formPending"
      :error="formError"
      @submit="submit"
    />

    <ConfirmDialog
      :open="deleteOpen"
      :pending="deletePending"
      confirm-variant="destructive"
      title="Delete group"
      confirm-text="Delete"
      cancel-text="Cancel"
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
      @update:open="deleteOpen = $event"
    >
      <template #description>
        Projects in this group will move to Unassigned. Projects and tests are
        not deleted.
      </template>
    </ConfirmDialog>
  </div>
</template>
```

Create `frontend/src/views/GroupsView.story.ts`:

```ts
import { defineComponent, h } from "vue";

import GroupsView from "./GroupsView.vue";

export const Groups = defineComponent(() => () => h(GroupsView));
```

- [ ] **Step 7: Run the CT test**

```bash
pnpm --filter ./frontend test-ct -- tests/ct/groups.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Run frontend typecheck**

```bash
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/FormDialog.vue frontend/src/components/groups frontend/src/views/GroupsView.vue frontend/src/views/GroupsView.story.ts frontend/tests/ct/groups.spec.ts frontend/tests/ct/mocks/groups.mocks.ts
git commit -m "feat(frontend): add groups page"
```

### Task 11: Rebuild Projects page with group sections and dialogs

**Files:**

- Create: `frontend/src/components/projects/ProjectGroupSection.vue`
- Create: `frontend/src/components/projects/NewProjectDialog.vue`
- Create: `frontend/src/components/projects/MoveProjectDialog.vue`
- Modify: `frontend/src/views/ProjectsView.vue`
- Modify: `frontend/tests/ct/mocks/projects.mocks.ts`
- Modify: `frontend/tests/ct/project-list.spec.ts`

- [ ] **Step 1: Update project mocks**

In `frontend/tests/ct/mocks/projects.mocks.ts`, update each project in `PROJECTS_PENDING_RESPONSE` to include:

```ts
        groupId: "g1",
        groupName: "Checkout",
        pendingCount: 1,
        testCount: 3,
```

Make `dashboard-ui` use `groupId: "g1", groupName: "Checkout", pendingCount: 0, testCount: 2` and `admin-ui` use `groupId: null, groupName: null, pendingCount: 2, testCount: 4`.

Add:

```ts
export const PROJECTS_PENDING_GROUPED_RESPONSE = PROJECTS_PENDING_RESPONSE;
```

- [ ] **Step 2: Write the failing CT test**

In `frontend/tests/ct/project-list.spec.ts`, update `shows projects` to assert group names and counts:

```ts
await expect(component).toContainText("Checkout");
await expect(component).toContainText("Unassigned");
```

Add:

```ts
test("opens the new project dialog", async ({ mount, page }) => {
  await mockApi(page, [
    ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
    ["**/api/v1/groups", GROUPS_RESPONSE],
  ]);

  const component = await mount("views/ProjectsView/Projects");
  await component.getByTestId(TEST_ID.newProject).click();

  await expect(page.getByTestId(TEST_ID.projectNameInput)).toBeVisible();
});
```

Import `GROUPS_RESPONSE`:

```ts
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test-ct -- tests/ct/project-list.spec.ts
```

Expected: FAIL because the Projects page has no group sections or dialog.

- [ ] **Step 4: Create the project group section component**

Create `frontend/src/components/projects/ProjectGroupSection.vue`:

```vue
<script setup lang="ts">
import { RouterLink } from "vue-router";
import { getStatusCountBadge } from "@/components/StatusBadge";
import { STATUS } from "@/domains/test-status";
import type { ProjectGroupSection } from "@/domains/projects/group-projects-by-group";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{ section: ProjectGroupSection }>();
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-muted-foreground">
        {{ section.name }}
      </h2>
      <span class="text-xs text-muted-foreground"
        >{{ section.projects.length }} projects</span
      >
    </div>

    <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <RouterLink
        v-for="project in section.projects"
        :key="project.id"
        :to="{ name: 'project-detail', params: { projectName: project.name } }"
        class="flex items-center justify-between gap-4 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50"
        :data-testid="TEST_ID.tableRow"
      >
        <div class="min-w-0">
          <p class="truncate font-medium">{{ project.name }}</p>
          <p class="text-xs text-muted-foreground">
            {{ project.testCount }} tests
          </p>
        </div>
        <component
          :is="
            getStatusCountBadge(
              STATUS.PENDING_APPROVAL,
              project.pendingCount ?? 0,
              { className: 'py-0.5 px-1.5' },
            )
          "
        />
      </RouterLink>
    </div>
  </section>
</template>
```

- [ ] **Step 5: Create the new project dialog**

Create `frontend/src/components/projects/NewProjectDialog.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FormDialog from "@/components/FormDialog.vue";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { ProjectGroup } from "@/domains/groups/group.model";

const props = defineProps<{
  open: boolean;
  groups: ProjectGroup[];
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: { name: string; groupId?: string }): void;
}>();

const name = ref("");
const groupId = ref("none");

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = "";
      groupId.value = "none";
    }
  },
);
</script>

<template>
  <FormDialog
    :open="open"
    title="New project"
    description="Projects are usually created by the first CI upload. You can also create one manually."
    :pending="pending"
    confirm-text="Create"
    @update:open="emit('update:open', $event)"
    @submit="
      emit('submit', {
        name: name.trim(),
        ...(groupId === 'none' ? {} : { groupId }),
      })
    "
  >
    <label class="block space-y-1 text-sm">
      <span>Name</span>
      <Input v-model="name" :data-testid="TEST_ID.projectNameInput" />
    </label>
    <label class="block space-y-1 text-sm">
      <span>Group</span>
      <Select v-model="groupId">
        <SelectTrigger :data-testid="TEST_ID.projectGroupSelect">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
    <p v-if="error" class="text-sm text-destructive">
      {{ sdkErrorMessage(error, "Could not create project") }}
    </p>
    <button
      type="submit"
      class="hidden"
      :data-testid="TEST_ID.projectFormSubmit"
    />
  </FormDialog>
</template>
```

- [ ] **Step 6: Create the move project dialog**

Create `frontend/src/components/projects/MoveProjectDialog.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FormDialog from "@/components/FormDialog.vue";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { ProjectGroup } from "@/domains/groups/group.model";

const props = defineProps<{
  open: boolean;
  groups: ProjectGroup[];
  currentGroupId?: string | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", groupId: string | null): void;
}>();

const groupId = ref("none");

watch(
  () => [props.open, props.currentGroupId],
  () => {
    groupId.value = props.currentGroupId ?? "none";
  },
  { immediate: true },
);
</script>

<template>
  <FormDialog
    :open="open"
    title="Move project"
    description="Choose the group this project belongs to."
    :pending="pending"
    confirm-text="Move"
    @update:open="emit('update:open', $event)"
    @submit="emit('submit', groupId === 'none' ? null : groupId)"
  >
    <Select v-model="groupId">
      <SelectTrigger :data-testid="TEST_ID.moveProjectSelect">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
          {{ group.name }}
        </SelectItem>
      </SelectContent>
    </Select>
    <p v-if="error" class="text-sm text-destructive">
      {{ sdkErrorMessage(error, "Could not move project") }}
    </p>
    <button
      type="submit"
      class="hidden"
      :data-testid="TEST_ID.moveProjectSubmit"
    />
  </FormDialog>
</template>
```

- [ ] **Step 7: Rebuild ProjectsView**

Replace `frontend/src/views/ProjectsView.vue` with:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import ErrorAlert from "@/components/ErrorAlert.vue";
import EmptyState from "@/components/EmptyState.vue";
import ProjectGroupSection from "@/components/projects/ProjectGroupSection.vue";
import NewProjectDialog from "@/components/projects/NewProjectDialog.vue";
import { useProjectsWithPendingQuery } from "@/composables/useProjects";
import { useGroupsQuery } from "@/composables/useGroups";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { projectsControllerCreate, type ProjectDto } from "@sdk";
import { FILTER_ALL } from "@/domains/test-status";
import { groupProjectsByGroup } from "@/domains/projects/group-projects-by-group";
import { invalidateProjectsForGroupChange } from "@/lib/invalidation";
import { TEST_ID } from "@/lib/test-ids";

const route = useRoute();
const router = useRouter();
const {
  data: projects,
  isLoading,
  error,
  refetch,
} = useProjectsWithPendingQuery();
const { data: groups } = useGroupsQuery();

const dialogOpen = ref(false);

const searchTerm = computed({
  get: () => String(route.query.q ?? ""),
  set: (value: string) =>
    void router.replace({
      query: { ...route.query, q: value || undefined },
    }),
});
const groupFilter = computed({
  get: () => String(route.query.group ?? FILTER_ALL),
  set: (value: string) =>
    void router.replace({
      query: {
        ...route.query,
        group: value === FILTER_ALL ? undefined : value,
      },
    }),
});

const filteredProjects = computed(() => {
  const term = searchTerm.value.toLowerCase();
  return (projects.value ?? []).filter((p) => {
    const matchesSearch = (p.name ?? "").toLowerCase().includes(term);
    const matchesGroup =
      groupFilter.value === FILTER_ALL ||
      (p.groupId ?? "unassigned") === groupFilter.value;
    return matchesSearch && matchesGroup;
  });
});
const sections = computed(() => groupProjectsByGroup(filteredProjects.value));

const createProject = useSdkMutation<
  ProjectDto,
  { name: string; groupId?: string }
>({
  mutationFn: (body) => projectsControllerCreate({ body }),
  successMessage: "Project created",
  errorMessage: "Could not create project",
  invalidate: (client) => invalidateProjectsForGroupChange(client),
  onSuccess: (_data, variables) => {
    dialogOpen.value = false;
    void router.push({
      name: "project-detail",
      params: { projectName: variables.name },
    });
  },
});
const createPending = computed(() => createProject.isPending.value);
const createError = computed(() => createProject.error.value);

function create(payload: { name: string; groupId?: string }) {
  if (!payload.name) return;
  createProject.mutate(payload);
}
</script>

<template>
  <Breadcrumbs class="px-6 py-3 text-sm text-muted-foreground" />

  <div class="space-y-6 p-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-xl font-semibold tracking-tight">Projects</h1>
      <div class="flex items-center gap-2">
        <Input
          :model-value="searchTerm"
          placeholder="Search project..."
          aria-label="Search projects"
          class="w-64 rounded-xl shadow-sm"
          :data-testid="TEST_ID.projectSearch"
          @update:model-value="searchTerm = String($event)"
        />
        <Select
          :model-value="groupFilter"
          @update:model-value="groupFilter = String($event)"
        >
          <SelectTrigger class="w-48" aria-label="Filter by group">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">All groups</SelectItem>
            <SelectItem
              v-for="group in groups ?? []"
              :key="group.id"
              :value="group.id"
            >
              {{ group.name }}
            </SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          :data-testid="TEST_ID.newProject"
          @click="dialogOpen = true"
        >
          New project
        </Button>
      </div>
    </div>

    <ErrorAlert
      v-if="error"
      variant="error"
      title="Failed to load projects"
      :message="error.message"
      retry
      :on-retry="refetch"
    />

    <div v-if="!error" class="space-y-6">
      <ProjectGroupSection
        v-for="section in sections"
        :key="section.id ?? '__unassigned__'"
        :section="section"
      />
      <EmptyState
        v-if="!isLoading && filteredProjects.length === 0"
        title="No projects found"
        description="Create a project or upload a screenshot from CI to get started."
      />
    </div>

    <NewProjectDialog
      v-model:open="dialogOpen"
      :groups="groups ?? []"
      :pending="createPending"
      :error="createError"
      @submit="create"
    />
  </div>
</template>
```

- [ ] **Step 8: Run the CT test and typecheck**

```bash
pnpm --filter ./frontend test-ct -- tests/ct/project-list.spec.ts
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/projects frontend/src/views/ProjectsView.vue frontend/tests/ct/mocks/projects.mocks.ts frontend/tests/ct/project-list.spec.ts
git commit -m "feat(frontend): group projects and add project creation"
```

### Task 12: Build the Inbox view

**Files:**

- Create: `frontend/src/components/inbox/InboxProjectSection.vue`
- Create: `frontend/src/views/InboxView.vue`
- Create: `frontend/src/views/InboxView.story.ts`
- Create: `frontend/tests/ct/inbox.spec.ts`
- Modify: `frontend/tests/ct/mocks/projects.mocks.ts`
- Modify: `frontend/tests/quality/cases.ts` (later in Task 15)

- [ ] **Step 1: Add inbox mocks**

Append to `frontend/tests/ct/mocks/projects.mocks.ts`:

```ts
export const REVIEW_INBOX_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    data: [
      {
        comparisonId: "c1",
        projectName: "checkout-ui",
        groupId: "g1",
        groupName: "Checkout",
        testName: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 157,
        mismatchPageCount: null,
        createdAt: "2026-10-20T10:00:00.000Z",
      },
      {
        comparisonId: "c2",
        projectName: "admin-ui",
        groupId: null,
        groupName: null,
        testName: "users",
        kind: "pdf",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 0,
        mismatchPageCount: 2,
        createdAt: "2026-10-21T10:00:00.000Z",
      },
    ],
    meta: { total: 2 },
  }),
};

export const REVIEW_INBOX_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ data: [], meta: { total: 0 } }),
};
```

- [ ] **Step 2: Write the failing CT test**

Create `frontend/tests/ct/inbox.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  REVIEW_INBOX_EMPTY_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "./mocks/projects.mocks";
import { TEST_ID } from "@/lib/test-ids";

test.describe("Review inbox", () => {
  test("groups pending reviews by group and project", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [["**/api/v1/review/pending*", REVIEW_INBOX_RESPONSE]]);

    const component = await mount("views/InboxView/Inbox");

    await expect(component).toContainText("Checkout");
    await expect(component).toContainText("Unassigned");
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(2);
  });

  test("shows the caught-up state", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/review/pending*", REVIEW_INBOX_EMPTY_RESPONSE],
    ]);

    const component = await mount("views/InboxView/Inbox");
    await expect(component).toContainText("All caught up");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test-ct -- tests/ct/inbox.spec.ts
```

Expected: FAIL because the view/story does not exist.

- [ ] **Step 4: Create the inbox project section**

Create `frontend/src/components/inbox/InboxProjectSection.vue`:

```vue
<script setup lang="ts">
import { useRouter } from "vue-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeAge } from "@/lib/format-date";
import { formatVariantLabel } from "@/lib/format-variant-label";
import type { InboxProjectSection } from "@/domains/pending-tests/group-review-inbox";
import type { ReviewInboxItem } from "@/domains/pending-tests/review-inbox.model";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{ section: InboxProjectSection }>();
const router = useRouter();

function openItem(item: ReviewInboxItem) {
  void router.push({
    name: "test-detail",
    params: { projectName: item.projectName, testName: item.testName },
    query: {
      viewport: item.viewport,
      browser: item.browser,
      environment: item.environment,
      from: "inbox",
    },
  });
}

function startProjectReview() {
  const first = props.section.items[0];
  if (!first) return;
  void router.push({
    name: "test-detail",
    params: { projectName: first.projectName, testName: first.testName },
    query: {
      viewport: first.viewport,
      browser: first.browser,
      environment: first.environment,
    },
  });
}
</script>

<template>
  <section class="space-y-2" :data-testid="TEST_ID.inboxProjectSection">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="font-semibold">{{ section.projectName }}</h2>
        <p class="text-xs text-muted-foreground">
          {{ section.items.length }} changes to review
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :data-testid="TEST_ID.reviewProjectButton"
        @click="startProjectReview"
      >
        Review {{ section.items.length }}
      </Button>
    </div>

    <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        v-for="item in section.items"
        :key="item.comparisonId"
        type="button"
        class="flex w-full items-center justify-between gap-4 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50"
        :data-testid="TEST_ID.inboxItem"
        @click="openItem(item)"
      >
        <div class="min-w-0">
          <p class="truncate font-medium">{{ item.testName }}</p>
          <p class="text-xs text-muted-foreground">
            {{ formatVariantLabel(item) || "No variant" }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Badge variant="outline">{{
            item.kind === "pdf" ? "PDF" : "Image"
          }}</Badge>
          <Badge variant="destructive">
            {{
              item.kind === "pdf"
                ? `${item.mismatchPageCount ?? 0} pages`
                : `${item.mismatchPixelCount} px`
            }}
          </Badge>
          <span class="text-xs text-muted-foreground">{{
            formatRelativeAge(item.createdAt)
          }}</span>
        </div>
      </button>
    </div>
  </section>
</template>
```

- [ ] **Step 5: Create the Inbox view**

Create `frontend/src/views/InboxView.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AsyncState from "@/components/AsyncState.vue";
import InboxProjectSection from "@/components/inbox/InboxProjectSection.vue";
import { useReviewInboxSections } from "@/composables/useReviewInbox";
import { FILTER_ALL } from "@/domains/test-status";
import { TEST_ID } from "@/lib/test-ids";

const {
  data: items,
  sections,
  isLoading,
  error,
  refetch,
} = useReviewInboxSections();

const search = ref("");
const kind = ref(FILTER_ALL);
const group = ref(FILTER_ALL);

const groups = computed(() => [
  ...new Set((items.value ?? []).map((item) => item.groupName ?? "Unassigned")),
]);

const filteredSections = computed(() => {
  const term = search.value.toLowerCase();
  const wantedGroup = group.value;
  const wantedKind = kind.value;
  return sections.value
    .filter(
      (section) => wantedGroup === FILTER_ALL || section.name === wantedGroup,
    )
    .map((section) => ({
      ...section,
      projects: section.projects
        .map((project) => ({
          ...project,
          items: project.items.filter(
            (item) =>
              (wantedKind === FILTER_ALL || item.kind === wantedKind) &&
              (!term || item.testName.toLowerCase().includes(term)),
          ),
        }))
        .filter((project) => project.items.length > 0),
    }))
    .filter((section) => section.projects.length > 0);
});

const total = computed(() =>
  filteredSections.value.reduce(
    (sum, section) =>
      sum +
      section.projects.reduce(
        (projectSum, project) => projectSum + project.items.length,
        0,
      ),
    0,
  ),
);
const projectCount = computed(() =>
  filteredSections.value.reduce(
    (sum, section) => sum + section.projects.length,
    0,
  ),
);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Review inbox</h1>
      <p class="text-sm text-muted-foreground">
        {{ total }} changes to review across {{ projectCount }} projects
      </p>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load review inbox"
      :retry="refetch"
      :empty="!isLoading && (items ?? []).length === 0"
      empty-title="All caught up"
      empty-description="There are no pending reviews right now."
    >
      <template #empty>
        <div class="space-y-3 py-12 text-center">
          <h2 class="text-lg font-medium" :data-testid="TEST_ID.reviewInbox">
            All caught up
          </h2>
          <p class="text-sm text-muted-foreground">
            There are no pending reviews right now.
          </p>
          <RouterLink
            to="/projects"
            class="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Browse projects
          </RouterLink>
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model="search"
          placeholder="Search test name..."
          aria-label="Search pending reviews"
          class="w-64 rounded-xl shadow-sm"
        />
        <Select v-model="kind">
          <SelectTrigger
            class="w-40"
            aria-label="Filter by kind"
            :data-testid="TEST_ID.filterKind"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">All kinds</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="pdf">PDFs</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="group">
          <SelectTrigger class="w-48" aria-label="Filter by group">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">All groups</SelectItem>
            <SelectItem v-for="name in groups" :key="name" :value="name">
              {{ name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        v-if="total === 0"
        class="py-12 text-center text-sm text-muted-foreground"
      >
        No pending reviews match these filters.
      </div>

      <div
        v-for="section in filteredSections"
        :key="section.id ?? '__unassigned__'"
        class="space-y-4"
      >
        <h2 class="text-sm font-semibold text-muted-foreground">
          {{ section.name }}
        </h2>
        <InboxProjectSection
          v-for="project in section.projects"
          :key="project.projectName"
          :section="project"
        />
      </div>
    </AsyncState>
  </div>
</template>
```

Create `frontend/src/views/InboxView.story.ts`:

```ts
import { defineComponent, h } from "vue";

import InboxView from "./InboxView.vue";

export const Inbox = defineComponent(() => () => h(InboxView));
```

- [ ] **Step 6: Run the CT test and typecheck**

```bash
pnpm --filter ./frontend test-ct -- tests/ct/inbox.spec.ts
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/inbox frontend/src/views/InboxView.vue frontend/src/views/InboxView.story.ts frontend/tests/ct/inbox.spec.ts frontend/tests/ct/mocks/projects.mocks.ts
git commit -m "feat(frontend): add review inbox"
```

### Task 13: Unify the project test list and add group actions

**Files:**

- Modify: `frontend/src/domains/test-status/filters.ts`
- Modify: `frontend/src/composables/useVisualTestsTable.ts`
- Modify: `frontend/src/components/tables/TestFilterBar.vue`
- Modify: `frontend/src/components/tables/VisualTestsTable.vue`
- Modify: `frontend/src/composables/useProjectDetailPage.ts`
- Modify: `frontend/src/views/ProjectDetailView.vue`
- Modify: `frontend/tests/ct/project-detail.spec.ts`
- Modify: `frontend/src/__tests__/useProjectDetailPage.test.ts`
- Modify: `frontend/src/__tests__/useVisualTestsTable.test.ts`

- [ ] **Step 1: Write the failing CT test**

Update `frontend/tests/ct/project-detail.spec.ts`:

- Replace `"Project: checkout-ui"` expectation with `"checkout-ui"`.
- Remove the PDF tab click from the empty-state test.
- Add:

```ts
test("shows the group and counts in the header", async ({ mount, page }) => {
  await mockApi(page, [
    ["**/api/v1/projects/checkout-ui", PROJECT_CHECKOUT_UI_RESPONSE],
    ["**/api/v1/groups", GROUPS_RESPONSE],
  ]);

  const component = await mount<typeof Routed>(
    "views/ProjectDetailView/Routed",
    { initialRoute: "/projects/checkout-ui" },
  );

  await expect(component.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
    "Checkout",
  );
  await expect(
    component.getByTestId(TEST_ID.projectPendingCount),
  ).toContainText("1");
});
```

Import `GROUPS_RESPONSE`:

```ts
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
```

Add `["**/api/v1/groups", GROUPS_RESPONSE]` to every existing `mockApi` call in `project-detail.spec.ts`, so the Move-to-group select has data in every test.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test-ct -- tests/ct/project-detail.spec.ts
```

Expected: FAIL because the tabs/header have not changed.

- [ ] **Step 3: Add the kind filter to the domain**

Modify `frontend/src/domains/test-status/filters.ts`:

```ts
export interface VisualTestFilters {
  search: string;
  browser: string;
  viewport: string;
  status: string;
  environment: string;
  kind: string;
}
```

- [ ] **Step 4: Extend the table composable and add URL sync**

Modify `frontend/src/composables/useVisualTestsTable.ts`:

```ts
import { ref, computed, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
// retain the existing imports for VisualTestItem, TestGroup, status helpers,
// and groupRowsByTestName

export interface VisualTestsTableOptions {
  tests: Ref<VisualTestItem[]>;
  syncUrl?: boolean;
}

export function useVisualTestsTable(options: VisualTestsTableOptions) {
  const { tests, syncUrl = false } = options;
  const route = syncUrl ? useRoute() : null;
  const router = syncUrl ? useRouter() : null;
  const queryValue = (key: string) =>
    route ? String(route.query[key] ?? "") : "";

  const filters = ref<VisualTestFilters>({
    search: queryValue("q"),
    browser: queryValue("browser") || FILTER_ALL,
    viewport: queryValue("viewport") || FILTER_ALL,
    status: queryValue("status") || FILTER_ALL,
    environment: queryValue("environment") || FILTER_ALL,
    kind: queryValue("kind") || FILTER_ALL,
  });

  const currentRoute = route;
  const currentRouter = router;
  if (currentRouter && currentRoute) {
    watch(
      filters,
      (value) => {
        void currentRouter.replace({
          query: {
            ...currentRoute.query,
            q: value.search || undefined,
            browser: value.browser === FILTER_ALL ? undefined : value.browser,
            viewport:
              value.viewport === FILTER_ALL ? undefined : value.viewport,
            status: value.status === FILTER_ALL ? undefined : value.status,
            environment:
              value.environment === FILTER_ALL ? undefined : value.environment,
            kind: value.kind === FILTER_ALL ? undefined : value.kind,
          },
        });
      },
      { deep: true },
    );
  }

  // The rest of the function (viewports/browsers/environments, matchesFilters,
  // filteredTests, groups, defaultAccordionValues) stays as it is. Add this
  // branch to matchesFilters:
  if (filters.value.kind !== FILTER_ALL && t.kind !== filters.value.kind) {
    return false;
  }

  // resetFilters sets kind: FILTER_ALL alongside the other fields.
}
```

Modify `frontend/src/components/tables/VisualTestsTable.vue` props:

```ts
const props = defineProps<{
  tests: VisualTestItem[];
  projectName: string;
  syncUrl?: boolean;
}>();
```

Pass it through:

```ts
const {
  filters,
  viewports,
  browsers,
  environments,
  groups,
  defaultAccordionValues,
  resetFilters,
} = useVisualTestsTable({ tests: testsRef, syncUrl: props.syncUrl });
```

In `ProjectDetailView.vue`, render:

```vue
<VisualTestsTable :tests="tests" :project-name="projectName ?? ''" sync-url />
```

- [ ] **Step 5: Add the kind select**

In `frontend/src/components/tables/TestFilterBar.vue`, add a fourth select before the status select:

```vue
<div class="flex items-center gap-2 min-w-[140px]">
        <Filter class="w-4 h-4 text-muted-foreground" />
        <Select
          :model-value="filters.kind"
          @update:model-value="
            emit('update:filters', { ...filters, kind: String($event) })
          "
        >
          <SelectTrigger
            class="min-w-[130px]"
            aria-label="Filter by kind"
            :data-testid="TEST_ID.filterKind"
          >
            <SelectValue placeholder="Kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">All kinds</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="pdf">PDFs</SelectItem>
          </SelectContent>
        </Select>
      </div>
```

- [ ] **Step 6: Add a kind column**

In `frontend/src/components/tables/VisualTestsTable.vue`, add before `latestStatus`:

```ts
  {
    accessorKey: "kind",
    header: "Kind",
    cell: ({ row }) =>
      h(
        "span",
        { class: "text-xs uppercase text-muted-foreground" },
        row.original.kind ?? "image",
      ),
  },
```

- [ ] **Step 7: Simplify the project detail composable**

Replace `frontend/src/composables/useProjectDetailPage.ts` with:

```ts
import { computed, reactive } from "vue";
import { countPending } from "@/domains/test-status";
import type { VisualTestItem } from "@/domains/projects/project.model";
import { useProjectDetailQuery } from "@/composables/useProjects";
import type { MaybeRef } from "@/composables/useDomainQuery";

export function useProjectDetailPage(
  projectName: MaybeRef<string | undefined>,
) {
  const projectQuery = useProjectDetailQuery(projectName);
  const project = projectQuery.data;
  const tests = computed<VisualTestItem[]>(
    () => project.value?.visualTests ?? [],
  );

  const pendingCount = computed(() =>
    countPending(tests.value, (t) => t.latestStatus),
  );
  const testCount = computed(
    () => new Set(tests.value.map((t) => t.name ?? "")).size,
  );

  return {
    project,
    tests,
    pendingCount,
    testCount,
    activeTabState: reactive({
      isLoading: projectQuery.isLoading,
      error: projectQuery.error,
      refetch: projectQuery.refetch,
    }),
  };
}
```

- [ ] **Step 8: Update the project-detail composable test**

Replace `frontend/src/__tests__/useProjectDetailPage.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useProjectDetailPage } from "@/composables/useProjectDetailPage";
import type { Project } from "@/domains/projects/project.model";

const project: Project = {
  id: "proj-1",
  name: "checkout",
  hasPendingTests: false,
  testCount: 5,
  createdAt: "2025-01-01",
  visualTests: [
    {
      name: "login",
      kind: "image",
      viewport: "1920x1080",
      browser: "chrome",
      latestStatus: "PENDING_APPROVAL",
    },
    {
      name: "cart",
      kind: "image",
      viewport: "1280x720",
      browser: "firefox",
      latestStatus: "UNCHANGED",
    },
    {
      name: "invoice",
      kind: "pdf",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
      latestStatus: "UNCHANGED",
    },
    {
      name: "invoice",
      kind: "pdf",
      viewport: "1280x720",
      browser: "firefox",
      environment: "staging",
      latestStatus: "PENDING_APPROVAL",
    },
  ],
};

const { useProjectDetailQueryMock } = vi.hoisted(() => ({
  useProjectDetailQueryMock: vi.fn(),
}));

vi.mock("@/composables/useProjects", () => ({
  useProjectDetailQuery: useProjectDetailQueryMock,
}));

describe("useProjectDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockProject(value: Project = project) {
    useProjectDetailQueryMock.mockReturnValue({
      data: ref(value),
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });
  }

  it("returns every test in one list", () => {
    mockProject();
    const { tests } = useProjectDetailPage(ref("checkout"));

    expect(tests.value.map((t) => t.name)).toEqual([
      "login",
      "cart",
      "invoice",
      "invoice",
    ]);
  });

  it("counts pending variants", () => {
    mockProject();
    const { pendingCount } = useProjectDetailPage(ref("checkout"));

    expect(pendingCount.value).toBe(2);
  });

  it("counts distinct tests", () => {
    mockProject();
    const { testCount } = useProjectDetailPage(ref("checkout"));

    expect(testCount.value).toBe(3);
  });

  it("exposes the project query state reactively", () => {
    const refetch = vi.fn();
    const isLoading = ref(true);
    const error = ref<Error | null>(null);
    useProjectDetailQueryMock.mockReturnValue({
      data: ref(project),
      isLoading,
      error,
      refetch,
    });

    const { activeTabState } = useProjectDetailPage(ref("checkout"));

    expect(activeTabState.isLoading).toBe(true);
    isLoading.value = false;
    expect(activeTabState.isLoading).toBe(false);
    error.value = new Error("boom");
    expect(activeTabState.error).toBeInstanceOf(Error);
    activeTabState.refetch();
    expect(refetch).toHaveBeenCalled();
  });

  it("handles an empty project", () => {
    mockProject({ ...project, visualTests: [], testCount: 0 });

    const { tests, pendingCount, testCount } = useProjectDetailPage(
      ref("checkout"),
    );

    expect(tests.value).toEqual([]);
    expect(pendingCount.value).toBe(0);
    expect(testCount.value).toBe(0);
  });
});
```

Add to `frontend/src/__tests__/useVisualTestsTable.test.ts`:

```ts
it("filters by kind", () => {
  const testsRef = ref([
    ...testTests,
    {
      name: "invoice",
      kind: "pdf",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
      latestStatus: "UNCHANGED",
    } satisfies VisualTestItem,
  ]);
  const { filteredTests, filters } = useVisualTestsTable({ tests: testsRef });

  filters.value.kind = "pdf";

  expect(filteredTests.value).toHaveLength(1);
  expect(filteredTests.value[0].name).toBe("invoice");
});
```

- [ ] **Step 9: Rebuild ProjectDetailView**

Replace `frontend/src/views/ProjectDetailView.vue` with:

```vue
<template>
  <Breadcrumbs class="px-6 py-3 text-sm text-muted-foreground" />

  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-1">
        <h2 class="text-xl font-semibold">
          {{ project?.name || "..." }}
        </h2>
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" :data-testid="TEST_ID.projectGroupBadge">
            {{ project?.groupName || "Unassigned" }}
          </Badge>
          <span :data-testid="TEST_ID.projectPendingCount">
            {{ pendingCount }} changes
          </span>
          <span :data-testid="TEST_ID.projectTestCount">
            {{ testCount }} tests
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        :data-testid="TEST_ID.moveProject"
        @click="moveOpen = true"
      >
        Move to group
      </Button>
    </div>

    <AsyncState
      :is-loading="activeTabState.isLoading"
      :error="activeTabState.error"
      error-title="Failed to load project"
      :retry="activeTabState.refetch"
      :empty="tests.length === 0"
      empty-title="No tests found"
      empty-description="This project has no tests yet."
    >
      <template #loading>
        <SkeletonAccordionGroups />
      </template>
      <VisualTestsTable
        :tests="tests"
        :project-name="projectName ?? ''"
        sync-url
      />
    </AsyncState>

    <MoveProjectDialog
      v-model:open="moveOpen"
      :groups="groups ?? []"
      :current-group-id="project?.groupId ?? null"
      :pending="movePending"
      :error="moveError"
      @submit="move"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { projectsControllerUpdateProject } from "@sdk";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import VisualTestsTable from "@/components/tables/VisualTestsTable.vue";
import SkeletonAccordionGroups from "@/components/cards/SkeletonAccordionGroups.vue";
import AsyncState from "@/components/AsyncState.vue";
import MoveProjectDialog from "@/components/projects/MoveProjectDialog.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProjectDetailPage } from "@/composables/useProjectDetailPage";
import { useRouteParams } from "@/composables/useRouteParams";
import { useGroupsQuery } from "@/composables/useGroups";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { invalidateProjectsForGroupChange } from "@/lib/invalidation";
import { TEST_ID } from "@/lib/test-ids";

const { projectName } = useRouteParams();
const { project, tests, pendingCount, testCount, activeTabState } =
  useProjectDetailPage(projectName);
const { data: groups } = useGroupsQuery();
const moveOpen = ref(false);

const moveMutation = useSdkMutation<
  unknown,
  { projectName: string; groupId: string | null }
>({
  mutationFn: ({ projectName, groupId }) =>
    projectsControllerUpdateProject({
      path: { projectName },
      body: { groupId },
    }),
  successMessage: "Project moved",
  errorMessage: "Could not move project",
  invalidate: (client) => invalidateProjectsForGroupChange(client),
  onSuccess: () => {
    moveOpen.value = false;
  },
});

const movePending = computed(() => moveMutation.isPending.value);
const moveError = computed(() => moveMutation.error.value);

function move(groupId: string | null) {
  if (!projectName.value) return;
  moveMutation.mutate({ projectName: projectName.value, groupId });
}
</script>
```

- [ ] **Step 10: Update project detail mocks**

In `frontend/tests/ct/mocks/projects.mocks.ts`, add to `PROJECT_CHECKOUT_UI_RESPONSE` body:

```ts
    groupId: "g1",
    groupName: "Checkout",
```

- [ ] **Step 11: Run CT and typecheck**

```bash
pnpm --filter ./frontend test-ct -- tests/ct/project-detail.spec.ts
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/domains/test-status/filters.ts frontend/src/composables/useVisualTestsTable.ts frontend/src/components/tables/TestFilterBar.vue frontend/src/components/tables/VisualTestsTable.vue frontend/src/composables/useProjectDetailPage.ts frontend/src/views/ProjectDetailView.vue frontend/tests/ct/project-detail.spec.ts frontend/tests/ct/mocks/projects.mocks.ts
git commit -m "feat(frontend): unify project test list and group actions"
```

### Task 14: Add review progress, keyboard shortcuts, and inbox return

**Files:**

- Modify: `frontend/src/composables/useRouteParams.ts`
- Modify: `frontend/src/composables/useTestNavigation.ts`
- Modify: `frontend/src/composables/useReviewSession.ts`
- Modify: `frontend/src/composables/useTestDetailsPage.ts`
- Create: `frontend/src/composables/useReviewShortcuts.ts`
- Modify: `frontend/src/views/VisualTestDetailsView.vue`
- Modify: `frontend/src/views/PdfTestDetailsView.vue`
- Modify: `frontend/src/domains/visual-test/visual-test.model.ts`
- Modify: `frontend/src/domains/visual-test/visual-test.mapper.ts`
- Test: `frontend/src/__tests__/useReviewSession.test.ts`
- Test: `frontend/src/__tests__/useRouteParams.test.ts`
- Test: `frontend/src/__tests__/useReviewShortcuts.test.ts`

- [ ] **Step 1: Write the failing route-param test**

In `frontend/src/__tests__/useRouteParams.test.ts`, add inside the existing `describe`:

```ts
it("exposes fromInbox when the review was opened from the inbox", () => {
  mockRoute.query = { from: "inbox" };

  const { fromInbox } = useRouteParams();

  expect(fromInbox.value).toBe(true);
});

it("returns false when the review was not opened from the inbox", () => {
  const { fromInbox } = useRouteParams();

  expect(fromInbox.value).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./frontend test -- src/__tests__/useRouteParams.test.ts
```

Expected: FAIL because `fromInbox` does not exist.

- [ ] **Step 3: Extend route params**

In `frontend/src/composables/useRouteParams.ts`:

```ts
const fromInbox = computed(() => route.query.from === "inbox");
```

Return it:

```ts
return {
  projectName,
  testName,
  filters,
  fromInbox,
};
```

- [ ] **Step 4: Add inbox navigation**

In `frontend/src/composables/useTestNavigation.ts`, add:

```ts
function navigateToInbox() {
  router.push({ name: "review-inbox" });
}
```

Return it.

- [ ] **Step 5: Extend the review session**

Modify `frontend/src/composables/useReviewSession.ts`:

Add imports:

```ts
import { computed, watch, type Ref } from "vue";
import { withReviewInboxItemRemoved } from "@/composables/useReviewInbox";
```

Extend the context:

```ts
interface ReviewSessionContext {
  restore: () => void;
  restoreInbox?: () => void;
  currentVariant: VariantParams;
  currentTestName: string;
}
```

Add to `ReviewSessionOptions`:

```ts
  returnToInbox?: boolean;
```

Destructure it:

```ts
const { returnToInbox = false } = args;
```

Add a progress computed after `buildCurrentKey`:

```ts
const progress = computed(() => {
  const currentKey = buildCurrentKey();
  const index = pendingTests.value.findIndex(
    (test) => keyOf({ name: test.name, ...test }) === currentKey,
  );
  return {
    current: index >= 0 ? index + 1 : 1,
    total: pendingTests.value.length,
  };
});
```

Replace `onMutate` with:

```ts
    onMutate: async () => {
      const { restore } = await withPendingTestRemoved(
        queryClient,
        projectName.value,
        buildCurrentKey(),
      );
      const inboxRemoval =
        returnToInbox && currentComparisonId.value
          ? await withReviewInboxItemRemoved(
              queryClient,
              currentComparisonId.value,
            )
          : null;
      return {
        restore,
        ...(inboxRemoval ? { restoreInbox: inboxRemoval.restore } : {}),
        currentVariant: { ...filters.value },
        currentTestName: testName.value,
      };
    },
```

Change `onSuccess`:

```ts
    onSuccess: () => {
      if (returnToInbox) {
        navigation.navigateToInbox();
        return;
      }
      navigateToNext();
    },
```

Change `onError`:

```ts
    onError: (_error, _variables, context) => {
      context?.restore?.();
      context?.restoreInbox?.();
    },
```

Change `handleSkip`:

```ts
const handleSkip = () => {
  if (returnToInbox) {
    navigation.navigateToInbox();
    return;
  }
  markSeenKey(buildCurrentKey());
  navigateToNext();
};
```

Return `progress`:

```ts
return {
  handleApprove,
  handleSkip,
  isApproving: approveMutation.isPending,
  progress,
};
```

Add a test for the inbox path in `frontend/src/__tests__/useReviewSession.test.ts`:

```ts
it("returns to the inbox and restores the inbox cache on failure", async () => {
  const args = { ...createArgs(), returnToInbox: true };
  const previousPending = [...args.pendingTests.value];
  useReviewSession(args);
  mockGetQueryData
    .mockReturnValueOnce(previousPending)
    .mockReturnValueOnce([{ comparisonId: "comp-1" }]);

  const context = await mutationOptions.onMutate();
  expect(mockCancelQueries).toHaveBeenCalledWith({
    queryKey: ["review-inbox", "list"],
  });
  expect(context.restoreInbox).toEqual(expect.any(Function));

  mutationOptions.onSuccess(undefined, undefined, context);
  expect(mockPush).toHaveBeenCalledWith({ name: "review-inbox" });

  const restoreInbox = vi.fn();
  context.restoreInbox = restoreInbox;
  mutationOptions.onError(new Error("fail"), undefined, context);
  expect(restoreInbox).toHaveBeenCalledOnce();
});
```

- [ ] **Step 6: Pass `returnToInbox` through the details shell**

Modify `frontend/src/composables/useTestDetailsPage.ts`:

Add to `useKindDetailsPage` args:

```ts
  returnToInbox?: Ref<boolean>;
```

Pass to `useReviewSession`:

```ts
    returnToInbox: args.returnToInbox?.value ?? false,
```

Return `progress` from the session:

```ts
const { handleApprove, handleSkip, isApproving, progress } = useReviewSession({
  // ...
});

return {
  data,
  isLoading,
  error,
  refetch,
  handleApprove,
  handleSkip,
  isApproving,
  progress,
  viewKey,
};
```

Update the wrappers to accept and pass `returnToInbox?: Ref<boolean>`.

- [ ] **Step 7: Show progress in the views**

In `frontend/src/views/VisualTestDetailsView.vue`:

- Import `useRouteParams` already.
- Destructure `fromInbox`:

```ts
const { projectName, testName, filters, fromInbox } = useRouteParams();
```

- Pass to the details page:

```ts
const {
  data,
  isLoading,
  error,
  refetch,
  viewKey,
  handleApprove,
  handleSkip,
  isApproving,
  progress,
} = useVisualTestDetailsPage({
  projectName,
  testName,
  filters,
  returnToInbox: fromInbox,
});
```

- Add next to breadcrumbs:

```vue
<span
  v-if="progress.total > 0"
  class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
  :data-testid="TEST_ID.reviewProgress"
>
      {{ progress.current }} of {{ progress.total }}
    </span>
```

- Add kind/age in `TestComparisonInfo` via `comparison.createdAt` after Step 8.

In `frontend/src/views/PdfTestDetailsView.vue`, do the same with `usePdfTestDetailsPage` and `progress`.

- [ ] **Step 8: Preserve comparison age**

Modify `frontend/src/domains/visual-test/visual-test.model.ts`:

```ts
export interface Comparison {
  id: string;
  diffImageUrl: string;
  mismatchPixelCount?: number;
  status: VisualTestStatus;
  thresholdExceeded: boolean;
  createdAt?: string;
  baseline?: Screenshot;
  candidate?: Screenshot;
}
```

Modify `frontend/src/domains/visual-test/visual-test.mapper.ts`:

```ts
    createdAt: dto.createdAt,
```

In `frontend/src/components/TestComparisonInfo.vue`, add below the variant badges:

```vue
<span v-if="comparison?.createdAt" class="text-xs text-muted-foreground">
      {{ formatRelativeAge(comparison.createdAt) }}
    </span>
```

Import:

```ts
import { formatRelativeAge } from "@/lib/format-date";
```

- [ ] **Step 9: Add the keyboard shortcut composable**

Create `frontend/src/composables/useReviewShortcuts.ts`:

```ts
import { onBeforeUnmount, onMounted } from "vue";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function useReviewShortcuts(options: {
  onApprove: () => void;
  onSkip: () => void;
  onBack: () => void;
  enabled?: boolean | (() => boolean);
}) {
  function handler(event: KeyboardEvent) {
    const enabled =
      typeof options.enabled === "function"
        ? options.enabled()
        : options.enabled !== false;
    if (!enabled) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditable(event.target)) return;

    if (event.key.toLowerCase() === "a") {
      event.preventDefault();
      options.onApprove();
    } else if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      options.onSkip();
    } else if (event.key === "Escape") {
      event.preventDefault();
      options.onBack();
    }
  }

  onMounted(() => window.addEventListener("keydown", handler));
  onBeforeUnmount(() => window.removeEventListener("keydown", handler));
}
```

Create `frontend/src/__tests__/useReviewShortcuts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { useReviewShortcuts } from "@/composables/useReviewShortcuts";

describe("useReviewShortcuts", () => {
  it("maps a/s/escape and ignores inputs", () => {
    const onApprove = vi.fn();
    const onSkip = vi.fn();
    const onBack = vi.fn();
    mount(
      defineComponent({
        setup() {
          useReviewShortcuts({ onApprove, onSkip, onBack, enabled: true });
          return () => null;
        },
      }),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    input.remove();
  });
});
```

- [ ] **Step 9b: Show the test kind in the review header**

In `frontend/src/components/TestDetailDispatcher.vue`, pass the resolved kind to both views:

```vue
<VisualTestDetailsView v-if="isImageKind(kind)" :kind="kind" />
<PdfTestDetailsView v-else-if="isPdfKind(kind)" :kind="kind" />
```

In both `VisualTestDetailsView.vue` and `PdfTestDetailsView.vue`, add:

```ts
defineProps<{ kind?: string }>();
```

Render a badge next to the progress badge:

```vue
<Badge
  v-if="kind"
  variant="outline"
>{{ kind === "pdf" ? "PDF" : "Image" }}</Badge>
```

Import `Badge` in each view.

- [ ] **Step 10: Wire shortcuts into the views**

In both detail views, after `handleApprove`/`handleSkip`:

```ts
import { useRouter } from "vue-router";
import { useReviewShortcuts } from "@/composables/useReviewShortcuts";

const router = useRouter();
useReviewShortcuts({
  onApprove: handleApprove,
  onSkip: handleSkip,
  onBack: () => router.back(),
  enabled: () => !!data.value?.comparison,
});
```

Add a hint in the footer area:

```vue
<p
  class="mt-2 text-center text-xs text-muted-foreground"
  :data-testid="TEST_ID.shortcutsHint"
>
  Press A to approve, S to skip, Esc to go back.
</p>
```

- [ ] **Step 11: Run unit tests and typecheck**

```bash
pnpm --filter ./frontend test -- src/__tests__/useRouteParams.test.ts src/__tests__/useReviewSession.test.ts src/__tests__/useReviewShortcuts.test.ts
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/composables/useRouteParams.ts frontend/src/composables/useTestNavigation.ts frontend/src/composables/useReviewSession.ts frontend/src/composables/useTestDetailsPage.ts frontend/src/composables/useReviewShortcuts.ts frontend/src/views/VisualTestDetailsView.vue frontend/src/views/PdfTestDetailsView.vue frontend/src/domains/visual-test frontend/src/components/TestComparisonInfo.vue frontend/src/__tests__
git commit -m "feat(frontend): add review progress and shortcuts"
```

### Task 15: Quality cases, E2E, and final verification

**Files:**

- Modify: `frontend/tests/quality/cases.ts`
- Modify: `frontend/tests/e2e/navigation.spec.ts`
- Create: `frontend/tests/e2e/review-inbox.spec.ts`
- Modify: `frontend/src/lib/test-ids.ts` if any missing ids

- [ ] **Step 1: Add quality cases**

In `frontend/tests/quality/cases.ts`, add imports:

```ts
import { GROUPS_RESPONSE } from "../ct/mocks/groups.mocks";
import { REVIEW_INBOX_RESPONSE } from "../ct/mocks/projects.mocks";
```

Add cases:

```ts
  {
    name: "inbox",
    story: "views/InboxView/Inbox",
    routes: [["**/api/v1/review/pending*", REVIEW_INBOX_RESPONSE]],
    readyTestId: TEST_ID.inboxItem,
  },
  {
    name: "groups",
    story: "views/GroupsView/Groups",
    routes: [["**/api/v1/groups", GROUPS_RESPONSE]],
    readyTestId: TEST_ID.groupRow,
  },
```

Add `GROUPS_RESPONSE` to the `projects` and `project-detail` cases:

```ts
routes: [
  [PROJECTS_GLOB, PROJECTS_PENDING_RESPONSE],
  ["**/api/v1/groups", GROUPS_RESPONSE],
],
```

Update the `app-shell` case so it still lands on a projects table and the sidebar badge does not call the real backend:

```ts
  {
    name: "app-shell",
    story: "AppShell/AppShell",
    props: { initialRoute: "/projects" },
    routes: [
      [PROJECTS_GLOB, PROJECTS_PENDING_RESPONSE],
      ["**/api/v1/review/pending*", REVIEW_INBOX_RESPONSE],
    ],
    readyTestId: TEST_ID.tableRow,
  },
```

- [ ] **Step 2: Update navigation E2E**

In `frontend/tests/e2e/navigation.spec.ts`:

- Change both existing project-list navigations (the list test and the
  navigate-to-detail test) from `/` to `/projects`:

```ts
await page.goto("/projects");
```

- Add:

```ts
test("lands on the review inbox", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Review inbox",
  );
});
```

- [ ] **Step 3: Add inbox E2E**

Create `frontend/tests/e2e/review-inbox.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import {
  createProject,
  deleteProject,
  setupReviewableTest,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

test.beforeEach(async () => {
  projectName = `e2e-inbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await createProject(projectName);
  await setupReviewableTest(projectName, "login-form");
});

test.afterEach(async () => {
  await deleteProject(projectName);
});

test("opens a single review from the inbox and returns to the inbox", async ({
  page,
}) => {
  await page.goto("/");
  const section = page
    .getByTestId(TEST_ID.inboxProjectSection)
    .filter({ hasText: projectName });
  const item = section
    .getByTestId(TEST_ID.inboxItem)
    .filter({ hasText: "login-form" });
  await expect(item).toBeVisible({ timeout: 10000 });
  await item.click();

  await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
    timeout: 10000,
  });
  await page.getByTestId(TEST_ID.approveChanges).click();

  await expect(page).toHaveURL("/", { timeout: 10000 });
});
```

- [ ] **Step 4: Run the complete verification suite**

```bash
pnpm --filter ./frontend lint
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
pnpm --filter ./frontend test-ct
pnpm --filter ./backend lint
pnpm --filter ./backend typecheck
pnpm --filter ./backend test -- test/unit
NODE_ENV=test pnpm --filter ./backend test:e2e -- test/e2e
pnpm run format:check
```

Expected: all commands PASS. If the quality baselines are stale, run:

```bash
./scripts/quality.sh visual --update
./scripts/quality.sh visual
./scripts/quality.sh a11y
```

- [ ] **Step 5: Commit**

```bash
git add frontend/tests frontend/src/lib/test-ids.ts
git commit -m "test: cover review inbox, groups and navigation"
```

---

## Notes for the implementer

- Do not edit generated `.gen.ts` files. Regenerate via `pnpm run sdk:generate` and build via `pnpm run sdk:build`.
- Groups are not permissions. Do not add membership, role, or visibility checks.
- The upload path stays unchanged. New CI-created projects appear as Unassigned.
- `ProjectGroup` is the code/DB name; `Group` is the UI label.
- The review queue remains project-scoped for the project pass. Only the inbox is cross-project.
- Keep `/projects` as the project list to preserve existing links; `/` is the new inbox.
- Use `TEST_ID.*` constants for all new test selectors. Do not add text selectors to CT/E2E.
- If the generated SDK function names differ from the expected names, use the generated names consistently and update only the frontend files.
