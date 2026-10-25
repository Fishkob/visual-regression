import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import { Prisma } from '@/prisma/client';
import type { TestKind } from '@common/domain/test-kind';
import { UNASSIGNED_GROUP_FILTER } from '@common/domain/group-filter';
import { PENDING_APPROVAL_STATUS_FILTER } from '@public/visualTest/core/domain/types/visual-test.types';
import { COMPARISON_INCLUDE } from '@public/visualTest/core/infrastructure/mappers/comparison.mapper';
import { variantFromRow } from '@public/visualTest/core/infrastructure/mappers/variant-row.mapper';

export interface PendingReviewRow {
  comparisonId: string;
  projectName: string;
  groupId: string | null;
  groupName: string | null;
  testName: string;
  kind: string;
  branchName: string;
  isDefaultBranch: boolean;
  variant: { viewport: string; browser: string; environment: string };
  mismatchPixelCount: number;
  mismatchPageCount: number | null;
  createdAt: Date;
  // Pending comparisons in this project on this branch, across every test.
  // The inbox page holds only one slice, but "Review N" must describe the set
  // the review pass will walk — so the count is computed unfiltered.
  projectPendingCount: number;
  projectBranchCount: number;
}

const INBOX_INCLUDE = {
  test: {
    select: {
      name: true,
      kind: true,
      branch: {
        select: {
          id: true,
          name: true,
          project: {
            select: {
              name: true,
              defaultBranchId: true,
              group: { select: { id: true, name: true } },
            },
          },
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

  async findPending(
    pagination?: { skip: number; take: number },
    filters?: {
      branchName?: string;
      projectName?: string;
      kind?: string;
      groupId?: string;
      q?: string;
    },
  ): Promise<{
    data: PendingReviewRow[];
    total: number;
  }> {
    const branchWhere: Prisma.BranchWhereInput = {};
    if (filters?.branchName) branchWhere.name = filters.branchName;
    else branchWhere.isArchived = false;

    const projectWhere: Prisma.ProjectWhereInput = {};
    if (filters?.projectName) projectWhere.name = filters.projectName;
    if (filters?.groupId === UNASSIGNED_GROUP_FILTER)
      projectWhere.groupId = null;
    else if (filters?.groupId) projectWhere.groupId = filters.groupId;
    if (Object.keys(projectWhere).length > 0) {
      branchWhere.project = projectWhere;
    }

    const testWhere: Prisma.UnifiedTestWhereInput = { branch: branchWhere };
    if (filters?.kind) testWhere.kind = filters.kind as TestKind;
    if (filters?.q) {
      testWhere.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        {
          branch: {
            project: {
              name: { contains: filters.q, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const where: Prisma.UnifiedComparisonWhereInput = {
      ...PENDING_APPROVAL_STATUS_FILTER,
      test: testWhere,
    };
    const { data, total } = await findManyWithCount<InboxComparisonRow>(
      this.client.unifiedComparison,
      {
        where,
        include: INBOX_INCLUDE,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: pagination?.skip,
        take: pagination?.take,
      },
    );

    const projectNames = [
      ...new Set(data.map((row) => row.test.branch.project.name)),
    ];
    const counts = await this.countPendingByProjectBranch(projectNames);

    return {
      data: data.map((row) => {
        const variant = variantFromRow(row.baseline);
        const projectName = row.test.branch.project.name;
        const branchName = row.test.branch.name;
        const count = counts.get(projectBranchKey(projectName, branchName));
        return {
          comparisonId: row.id,
          projectName,
          groupId: row.test.branch.project.group?.id ?? null,
          groupName: row.test.branch.project.group?.name ?? null,
          testName: row.test.name,
          kind: row.test.kind,
          branchName,
          isDefaultBranch:
            row.test.branch.id === row.test.branch.project.defaultBranchId,
          variant: {
            viewport: variant.viewport,
            browser: variant.browser,
            environment: variant.environment,
          },
          mismatchPixelCount: row.mismatchPixelCount,
          mismatchPageCount: row.mismatchPageCount ?? null,
          createdAt: row.createdAt,
          projectPendingCount: count?.count ?? 0,
          projectBranchCount: count?.branchCount ?? 1,
        };
      }),
      total,
    };
  }

  // The branch choices for the inbox filter. Derived from the pending set
  // rather than a page of it, so the dropdown does not lose branches as the
  // list paginates.
  async findPendingBranchNames(): Promise<string[]> {
    const rows = await this.client.$queryRaw<{ name: string }[]>(Prisma.sql`
      SELECT DISTINCT b.name AS name
      FROM "UnifiedComparison" c
      JOIN "UnifiedTest" t ON t.id = c."testId"
      JOIN "Branch" b ON b.id = t."branchId"
      WHERE c.status = 'PENDING_APPROVAL' AND b."isArchived" = false
      ORDER BY b.name ASC
    `);
    return rows.map((row) => row.name);
  }

  private async countPendingByProjectBranch(
    projectNames: string[],
  ): Promise<Map<string, { count: number; branchCount: number }>> {
    if (projectNames.length === 0) return new Map();

    const rows = await this.client.$queryRaw<
      { projectName: string; branchName: string; count: bigint }[]
    >(Prisma.sql`
      SELECT p.name AS "projectName", b.name AS "branchName", COUNT(*) AS count
      FROM "UnifiedComparison" c
      JOIN "UnifiedTest" t ON t.id = c."testId"
      JOIN "Branch" b ON b.id = t."branchId"
      JOIN "Project" p ON p.id = b."projectId"
      WHERE c.status = 'PENDING_APPROVAL'
        AND b."isArchived" = false
        AND p.name IN (${Prisma.join(projectNames)})
      GROUP BY p.name, b.name
    `);

    const branchesByProject = new Map<string, Set<string>>();
    for (const row of rows) {
      const branches = branchesByProject.get(row.projectName) ?? new Set();
      branches.add(row.branchName);
      branchesByProject.set(row.projectName, branches);
    }

    const counts = new Map<string, { count: number; branchCount: number }>();
    for (const row of rows) {
      counts.set(projectBranchKey(row.projectName, row.branchName), {
        count: Number(row.count),
        branchCount: branchesByProject.get(row.projectName)?.size ?? 1,
      });
    }
    return counts;
  }
}

function projectBranchKey(projectName: string, branchName: string): string {
  return `${projectName}\u0000${branchName}`;
}
