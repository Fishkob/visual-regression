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
  variants: ProjectVariantStatus[];
}

interface ProjectPendingFlag {
  id: string;
  name: string;
  createdAt: Date;
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
      }),
      this.client.project.count(),
    ]);

    if (projects.length === 0) return { data: [], total };

    const pendingCounts = await this.getPendingCounts(
      projects.map((p) => p.id),
    );
    const countsByProject = new Map(
      pendingCounts.map((count) => [count.projectId, count.pendingCount]),
    );

    return {
      data: projects.map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        hasPendingComparisons: (countsByProject.get(p.id) ?? 0) > 0,
      })),
      total,
    };
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
