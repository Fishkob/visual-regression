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

  async listForTest(testId: string, comparisonId?: string) {
    return this.client.reviewComment.findMany({
      where: {
        testId,
        ...(comparisonId ? { comparisonId } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
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
