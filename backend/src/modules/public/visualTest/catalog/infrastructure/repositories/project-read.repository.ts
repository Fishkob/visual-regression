import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { Prisma } from '@/prisma/client';
import { REVIEWABLE_PENDING_SQL } from '@public/visualTest/core/infrastructure/repositories/reviewable-pending.sql';
import {
  VariantStore,
  type ProjectVariantFilterOptions,
  type ProjectVariantPageFilters,
  type ProjectVariantStatusRow,
} from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { UNASSIGNED_GROUP_FILTER } from '@common/domain/group-filter';

export interface PendingCount {
  projectId: string;
  pendingCount: number;
}

export interface TestCount {
  projectId: string;
  testCount: number;
}

export type ProjectVariantStatus = ProjectVariantStatusRow;

export interface ProjectWithVariants {
  id: string;
  name: string;
  createdAt: Date;
  groupId: string | null;
  groupName: string | null;
  branchName: string;
  defaultBranchName: string;
  requiredApprovals: number;
  variants: ProjectVariantStatus[];
  total: number;
  filterOptions: ProjectVariantFilterOptions;
}

export interface ProjectPendingFlag {
  id: string;
  name: string;
  createdAt: Date;
  groupId: string | null;
  groupName: string | null;
  pendingCount: number;
  testCount: number;
  hasPendingComparisons: boolean;
}

// The project-scoped read seam for the review module: the project overview
// statuses, the project list with pending flags, and the raw pending counts.
// Test-scoped reads (details, PDF sources/ownership, test listing, pending
// list) live on TestReadRepository. The overview derives its per-variant status
// from VariantStore.findProjectVariantPage — not from the aggregate's
// findVariantStatusSignalsFor, because a page across a branch chain has to
// filter, sort and count variants in one statement. The two share the policy
// (resolveVariantStatusFromComparison) and the "at most one pending comparison
// per variant" invariant; VariantStore.findVariantStatusSignalsFor documents the
// equivalence and the e2e test that pins it.
@Injectable()
export class ProjectReadRepository {
  constructor(
    private readonly connection: PrismaConnection,
    private readonly variants: VariantStore,
    private readonly branchResolver: BranchResolver,
  ) {}

  private get client() {
    return this.connection.client;
  }

  async getWithLatestVariantStatuses(
    projectName: string,
    branchName?: string,
    pagination: { skip: number; take: number } = { skip: 0, take: 50 },
    filters: ProjectVariantPageFilters = {},
  ): Promise<ProjectWithVariants | null> {
    const project = await this.client.project.findUnique({
      where: { name: projectName },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!project) return null;

    const branch = await this.branchResolver.resolveRead(
      projectName,
      branchName,
    );
    const defaultBranchName = await this.branchResolver.resolveDefaultName(
      project.id,
    );
    // The overview table's unit is a variant row, so the page, its filters and
    // its total all come from one variant-level query. Filter options are read
    // from the whole branch set, not the page.
    const [page, filterOptions] = await Promise.all([
      this.variants.findProjectVariantPage(
        branch.branchId,
        filters,
        pagination,
      ),
      this.variants.findProjectVariantFilterOptions(branch.branchId),
    ]);

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      groupId: project.group?.id ?? null,
      groupName: project.group?.name ?? null,
      branchName: branch.branchName,
      defaultBranchName,
      requiredApprovals: project.requiredApprovals,
      variants: page.data,
      total: page.total,
      filterOptions,
    };
  }

  async getAllWithPendingFlag(
    pagination?: {
      skip: number;
      take: number;
    },
    filters?: { q?: string; groupId?: string },
  ): Promise<{
    data: ProjectPendingFlag[];
    total: number;
  }> {
    // Server-side search + group filter: the project list pages through the
    // result, so filtering client-side would only filter the current page.
    const where: Prisma.ProjectWhereInput = {};
    const search = filters?.q?.trim();
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (filters?.groupId === UNASSIGNED_GROUP_FILTER) where.groupId = null;
    else if (filters?.groupId) where.groupId = filters.groupId;

    const [projects, total] = await Promise.all([
      this.client.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination?.skip,
        take: pagination?.take,
        include: { group: { select: { id: true, name: true } } },
      }),
      this.client.project.count({ where }),
    ]);
    return { data: await this.hydrateProjects(projects), total };
  }

  private async hydrateProjects(
    projects: {
      id: string;
      name: string;
      createdAt: Date;
      group: { id: string; name: string } | null;
    }[],
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
      SELECT b."projectId" as "projectId", COUNT(DISTINCT t."name") as "testCount"
      FROM "UnifiedTest" t
      JOIN "Branch" b ON b."id" = t."branchId"
      WHERE b."isArchived" = false
        ${
          projectIds && projectIds.length > 0
            ? Prisma.sql`AND b."projectId" IN (${Prisma.join(projectIds)})`
            : Prisma.empty
        }
      GROUP BY b."projectId"
    `;
    return result.map(({ projectId, testCount }) => ({
      projectId,
      testCount: Number(testCount),
    }));
  }

  async getPendingCounts(projectIds?: string[]): Promise<PendingCount[]> {
    const result = await this.client.$queryRaw<
      { projectId: string; pendingCount: bigint }[]
    >`
      SELECT b."projectId" as "projectId", COUNT(c.id) as "pendingCount"
      FROM "UnifiedComparison" c
      JOIN "UnifiedTest" t ON c."testId" = t.id
      JOIN "Branch" b ON b."id" = t."branchId"
      WHERE ${REVIEWABLE_PENDING_SQL}
        AND b."isArchived" = false
        ${
          projectIds && projectIds.length > 0
            ? Prisma.sql`AND b."projectId" IN (${Prisma.join(projectIds)})`
            : Prisma.empty
        }
      GROUP BY b."projectId"
    `;
    return result.map(({ projectId, pendingCount }) => ({
      projectId,
      pendingCount: Number(pendingCount),
    }));
  }
}
