import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';

// ReviewComment deliberately carries no foreign key to the test or project it
// names, so a test/project delete would silently leave the discussion behind.
// This repository is the single owner of the row-first cleanup: the deletion
// service calls it inside the same StateChangeWorkflow transaction as the test
// delete, and the maintenance task sweeps whatever an older/other path already
// orphaned.
//
// ApprovalVote is deliberately EXCLUDED from that cleanup: the vote rows are
// the durable 4-eyes audit trail (schema comment on ApprovalVote), and the
// Approval summary row is only written once the threshold is reached — the
// votes are the only record of the earlier reviewers. They therefore outlive
// the test and are intentionally retained.
@Injectable()
export class ReviewArtifactRepository extends BaseRepository {
  async deleteForTestIds(testIds: string[]): Promise<void> {
    this.assertWritable();
    if (testIds.length === 0) return;
    await this.client.reviewComment.deleteMany({
      where: { testId: { in: testIds } },
    });
  }

  // Project-scoped backstop: comments left from an earlier failed delete (or
  // written with a stale testId) would not match the testId list. Run after the
  // testId deletes; idempotent. Votes are audit and are not touched here.
  async deleteForProjectName(projectName: string): Promise<void> {
    this.assertWritable();
    await this.client.reviewComment.deleteMany({ where: { projectName } });
  }
}
