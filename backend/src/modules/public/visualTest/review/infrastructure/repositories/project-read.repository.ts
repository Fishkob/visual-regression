import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { Prisma } from '@/prisma/client';
import {
  TestStatus,
  PENDING_APPROVAL_STATUS_FILTER,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { resolveVariantStatusFromComparison } from '@public/visualTest/core/domain/policies/test-status.policy';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';

export interface PendingCount {
  projectId: string;
  pendingCount: number;
}

export interface TestCount {
  projectId: string;
  testCount: number;
}

export interface ProjectVariantStatus {
  testName: string;
  kind: string;
  viewport: string;
  browser: string;
  environment: string;
  status: TestStatus;
}

export interface ProjectWithVariants {
  id: string;
  name: string;
  createdAt: Date;
  groupId: string | null;
  groupName: string | null;
  variants: ProjectVariantStatus[];
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
// from VariantStore.findVariantStatusSignalsFor — the same query the persisted
// aggregate recompute uses — so the read model cannot drift from the aggregate.
@Injectable()
export class ProjectReadRepository {
  constructor(
    private readonly connection: PrismaConnection,
    private readonly variants: VariantStore,
  ) {}

  private get client() {
    return this.connection.client;
  }

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

  async getPendingCounts(projectIds?: string[]): Promise<PendingCount[]> {
    const result = await this.client.$queryRaw<
      { projectId: string; pendingCount: bigint }[]
    >`
      SELECT ut."projectId" as "projectId", COUNT(uc.id) as "pendingCount"
      FROM "UnifiedComparison" uc
      JOIN "UnifiedTest" ut ON uc."testId" = ut.id
      WHERE uc.status = ${PENDING_APPROVAL_STATUS_FILTER.status}
        ${
          projectIds && projectIds.length > 0
            ? Prisma.sql`AND ut."projectId" IN (${Prisma.join(projectIds)})`
            : Prisma.empty
        }
      GROUP BY ut."projectId"
    `;
    return result.map(({ projectId, pendingCount }) => ({
      projectId,
      pendingCount: Number(pendingCount),
    }));
  }
}
