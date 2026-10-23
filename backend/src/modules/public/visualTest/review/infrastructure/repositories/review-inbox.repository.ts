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

  async findPending(pagination?: { skip: number; take: number }): Promise<{
    data: PendingReviewRow[];
    total: number;
  }> {
    const { data, total } = await findManyWithCount<InboxComparisonRow>(
      this.client.unifiedComparison,
      {
        where: PENDING_APPROVAL_STATUS_FILTER,
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
