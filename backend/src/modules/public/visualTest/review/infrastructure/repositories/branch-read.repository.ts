import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { REVIEWABLE_PENDING_SQL } from '@public/visualTest/review/infrastructure/repositories/reviewable-pending.sql';

export interface BranchSummary {
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  targetBranchName: string | null;
  testCount: number;
  pendingCount: number;
  createdAt: Date;
}

// The branch switcher / management read model: every branch of a project with
// its effective target, its own test count and its pending comparisons.
@Injectable()
export class BranchReadRepository {
  constructor(
    private readonly connection: PrismaConnection,
    private readonly branchResolver: BranchResolver,
  ) {}

  async list(
    projectName: string,
    includeArchived: boolean,
  ): Promise<BranchSummary[]> {
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
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
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
      WHERE ${REVIEWABLE_PENDING_SQL} AND b."projectId" = ${projectId}
      GROUP BY t."branchId"
    `;
    return new Map(rows.map((row) => [row.branchId, Number(row.pendingCount)]));
  }
}
