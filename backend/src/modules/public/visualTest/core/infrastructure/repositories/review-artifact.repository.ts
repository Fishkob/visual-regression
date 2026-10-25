import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';

// ReviewComment and ApprovalVote deliberately carry no foreign key to the test
// or project they name (the trail outlives a deleted row), so a test/project
// delete would silently leave them behind. This repository is the single owner
// of the row-first cleanup: the deletion service calls it inside the same
// StateChangeWorkflow transaction as the test delete, and the maintenance task
// sweeps whatever an older/other path already orphaned.
@Injectable()
export class ReviewArtifactRepository extends BaseRepository {
  async deleteForTestIds(testIds: string[]): Promise<void> {
    this.assertWritable();
    if (testIds.length === 0) return;
    await this.client.reviewComment.deleteMany({
      where: { testId: { in: testIds } },
    });
    await this.client.approvalVote.deleteMany({
      where: { testId: { in: testIds } },
    });
  }

  // Project-scoped backstop: comments/votes left from an earlier failed delete
  // (or written with a stale testId) would not match the testId list. Run after
  // the testId deletes; idempotent.
  async deleteForProjectName(projectName: string): Promise<void> {
    this.assertWritable();
    await this.client.reviewComment.deleteMany({ where: { projectName } });
    await this.client.approvalVote.deleteMany({ where: { projectName } });
  }
}
