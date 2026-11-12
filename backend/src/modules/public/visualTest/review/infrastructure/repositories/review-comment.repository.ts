import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';

@Injectable()
export class ReviewCommentRepository extends BaseRepository {
  async create(input: {
    projectName: string;
    branchName: string | null;
    testId: string;
    comparisonId: string | null;
    body: string;
    authorId: string | null;
    author: string;
  }) {
    return this.client.reviewComment.create({ data: input });
  }

  // One page of the thread, newest window first (a reviewer needs the recent
  // discussion; the oldest page would freeze the thread). The caller receives
  // the page oldest→newest so the chronology stays, hence the in-memory reverse
  // after the bounded desc query.
  //
  // `before` is the cursor: the (createdAt, id) pair of the oldest comment the
  // caller already holds. `id` alone is not time-ordered, so the pair is the
  // key — and the same pair, descending, is the ORDER BY, which is what makes
  // "strictly after the cursor" a total order with no skipped or repeated row.
  // `createdAt` is TIMESTAMP(3), so the millisecond the cursor carries is the
  // stored value, not a truncation of it.
  async listForTest(
    testId: string,
    query: {
      comparisonId?: string;
      before?: { id: string; createdAt: Date };
      limit: number;
    },
  ) {
    const rows = await this.client.reviewComment.findMany({
      where: {
        testId,
        ...(query.comparisonId ? { comparisonId: query.comparisonId } : {}),
        ...(query.before
          ? {
              OR: [
                { createdAt: { lt: query.before.createdAt } },
                {
                  createdAt: query.before.createdAt,
                  id: { lt: query.before.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return rows.reverse();
  }

  async findById(id: string) {
    return this.client.reviewComment.findUnique({ where: { id } });
  }

  async resolve(id: string, resolvedBy: string) {
    return this.client.reviewComment.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedBy },
    });
  }
}
