import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import type { Prisma } from '@/prisma/client';
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
    filters?: { branchName?: string; projectName?: string },
  ): Promise<{
    data: PendingReviewRow[];
    total: number;
  }> {
    const branchWhere: Prisma.BranchWhereInput = {};
    if (filters?.branchName) branchWhere.name = filters.branchName;
    else branchWhere.isArchived = false;
    if (filters?.projectName)
      branchWhere.project = { name: filters.projectName };
    const where: Prisma.UnifiedComparisonWhereInput = {
      ...PENDING_APPROVAL_STATUS_FILTER,
      ...(Object.keys(branchWhere).length > 0
        ? { test: { branch: branchWhere } }
        : {}),
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

    return {
      data: data.map((row) => {
        const variant = variantFromRow(row.baseline);
        return {
          comparisonId: row.id,
          projectName: row.test.branch.project.name,
          groupId: row.test.branch.project.group?.id ?? null,
          groupName: row.test.branch.project.group?.name ?? null,
          testName: row.test.name,
          kind: row.test.kind,
          branchName: row.test.branch.name,
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
        };
      }),
      total,
    };
  }
}
