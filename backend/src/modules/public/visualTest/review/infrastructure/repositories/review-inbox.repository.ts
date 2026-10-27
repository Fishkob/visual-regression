import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import { Prisma } from '@/prisma/client';
import type { TestKind } from '@common/domain/test-kind';
import { UNASSIGNED_GROUP_FILTER } from '@common/domain/group-filter';
import {
  REVIEWABLE_PENDING_SQL,
  reviewablePendingWhere,
} from '@public/visualTest/core/infrastructure/repositories/reviewable-pending.sql';
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
  runKey: string | null;
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

// The queue's archived scope: archived branches are out, unless the caller
// names a branch explicitly. One decision, rendered into the two shapes the
// readers need — a Prisma where for the page, a SQL clause for the counts — so
// the project section's "Review N" describes the rows the queue is showing.
// The page and its count used to decide this separately: the count hard-coded
// the exclusion, so a filtered archived branch listed rows whose header said 0.
type ArchivedScope = { kind: 'named'; branchName: string } | { kind: 'live' };

function archivedScope(branchName?: string): ArchivedScope {
  return branchName ? { kind: 'named', branchName } : { kind: 'live' };
}

function branchWhereFor(scope: ArchivedScope): Prisma.BranchWhereInput {
  return scope.kind === 'named'
    ? { name: scope.branchName }
    : { isArchived: false };
}

function archivedClauseFor(scope: ArchivedScope) {
  return scope.kind === 'named'
    ? Prisma.sql`AND b.name = ${scope.branchName}`
    : Prisma.sql`AND b."isArchived" = false`;
}

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
      runKey?: string;
      tag?: string;
      assigneeId?: string;
    },
  ): Promise<{
    data: PendingReviewRow[];
    total: number;
  }> {
    // One archived rule for the queue: archived branches are out — unless the
    // caller names a branch explicitly, which is a deliberate deep link into
    // one archived branch's pending work. The count below applies the same
    // conditional, so the project section's "Review N" describes the rows the
    // queue is showing; before, the count hard-coded the exclusion and a
    // filtered archived branch listed rows whose header said 0.
    const branchWhere: Prisma.BranchWhereInput = branchWhereFor(
      archivedScope(filters?.branchName),
    );

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
    if (filters?.tag) testWhere.tags = { has: filters.tag };
    if (filters?.assigneeId) {
      testWhere.assignments = {
        some: { assigneeId: filters.assigneeId, completedAt: null },
      };
    }
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

    // "Pending ∧ not muted" comes from the shared predicate, in its complete
    // form: the status rides along, so this reader cannot forget it. Muted tests
    // stay out of the queue until their mute expires; the comparison still
    // exists, so unmuting makes it visible again.
    const where: Prisma.UnifiedComparisonWhereInput = {
      ...reviewablePendingWhere({ test: testWhere }),
      ...(filters?.runKey ? { runKey: filters.runKey } : {}),
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
    const counts = await this.countPendingByProjectBranch(
      projectNames,
      filters?.branchName,
    );

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
          runKey: row.runKey ?? null,
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
      WHERE ${REVIEWABLE_PENDING_SQL} AND b."isArchived" = false
      ORDER BY b.name ASC
    `);
    return rows.map((row) => row.name);
  }

  private async countPendingByProjectBranch(
    projectNames: string[],
    branchName?: string,
  ): Promise<Map<string, { count: number; branchCount: number }>> {
    if (projectNames.length === 0) return new Map();
    const scope = archivedScope(branchName);

    const rows = await this.client.$queryRaw<
      { projectName: string; branchName: string; count: bigint }[]
    >(Prisma.sql`
      SELECT p.name AS "projectName", b.name AS "branchName", COUNT(*) AS count
      FROM "UnifiedComparison" c
      JOIN "UnifiedTest" t ON t.id = c."testId"
      JOIN "Branch" b ON b.id = t."branchId"
      JOIN "Project" p ON p.id = b."projectId"
      WHERE ${REVIEWABLE_PENDING_SQL}
        ${archivedClauseFor(scope)}
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
