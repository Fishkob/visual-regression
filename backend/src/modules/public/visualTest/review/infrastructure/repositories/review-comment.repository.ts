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

  // The window is the NEWEST 200 comments (a thread's recent discussion is
  // what a reviewer needs; the oldest 200 would freeze the thread after 200
  // posts). The caller still receives them oldest→newest so the UI chronology
  // stays, hence the in-memory reverse after the bounded desc query.
  async listForTest(testId: string, comparisonId?: string) {
    const rows = await this.client.reviewComment.findMany({
      where: {
        testId,
        ...(comparisonId ? { comparisonId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
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
