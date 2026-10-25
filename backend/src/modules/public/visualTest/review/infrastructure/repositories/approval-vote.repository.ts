import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';

@Injectable()
export class ApprovalVoteRepository extends BaseRepository {
  async countForComparison(comparisonId: string): Promise<number> {
    return this.client.approvalVote.count({ where: { comparisonId } });
  }

  async hasVoted(comparisonId: string, username: string): Promise<boolean> {
    const row = await this.client.approvalVote.findUnique({
      where: { comparisonId_userId: { comparisonId, userId: username } },
      select: { id: true },
    });
    return row !== null;
  }

  async record(input: {
    comparisonId: string;
    projectName: string;
    testId: string;
    username: string;
  }): Promise<void> {
    this.assertWritable();
    await this.client.approvalVote.create({
      data: {
        comparisonId: input.comparisonId,
        projectName: input.projectName,
        testId: input.testId,
        userId: input.username,
        username: input.username,
      },
    });
  }

  async listForComparison(comparisonId: string) {
    return this.client.approvalVote.findMany({
      where: { comparisonId },
      orderBy: { approvedAt: 'asc' },
      select: { username: true, approvedAt: true },
    });
  }
}
