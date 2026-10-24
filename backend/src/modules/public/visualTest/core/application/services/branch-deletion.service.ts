import { Inject, Injectable } from '@nestjs/common';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import {
  deleted,
  DELETION_STATE_CHANGE_RETRY,
} from '@public/visualTest/core/application/services/state-change-options';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { JOB_PRODUCER, IJobProducer } from '@common/domain/job-queue.interface';
import { DomainError } from '@common/domain/domain-error';

// Branch deletion is branch-scoped: it cancels the branch's pending jobs,
// collects the files its tests own, deletes the branch (cascading into its
// tests and their chain) and reclaims the URLs no surviving row references.
// The reclamation filter runs after the cascade inside the same transaction, so
// an inherited baseline clone that shares its file with the target branch never
// takes the target's file with it.
@Injectable()
export class BranchDeletionService {
  constructor(
    private readonly branches: BranchRepository,
    private readonly tests: UnifiedTestRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
    @Inject(JOB_PRODUCER) private readonly jobQueue: IJobProducer,
    private readonly workflow: StateChangeWorkflow,
  ) {}

  async delete(projectId: string, branchId: string): Promise<void> {
    await this.workflow.executeStateChange(
      async () => {
        const branch = await this.branches.findById(branchId);
        if (branch?.projectId !== projectId) {
          throw new DomainError('Branch not found', 'NOT_FOUND');
        }
        const defaultBranch = await this.branches.findDefault(branch.projectId);
        if (defaultBranch?.id === branch.id) {
          throw new DomainError(
            'The default branch cannot be deleted',
            'CONFLICT',
          );
        }
        // A target of other branches carries their inheritance; deleting it
        // would silently re-parent them to the project default (the FK is
        // ON DELETE SET NULL) and their clones would keep the deleted branch's
        // content under a new label. Make that an explicit decision instead.
        const dependents = await this.branches.findDependentNames(branchId);
        if (dependents.length > 0) {
          const names = dependents.map((name) => `"${name}"`).join(', ');
          throw new DomainError(
            `Branch "${branch.name}" is the target of ${names} — retarget ${
              dependents.length === 1 ? 'it' : 'them'
            } before deleting it`,
            'CONFLICT',
          );
        }
        const testIds = await this.tests.findIdsByBranchId(branchId);
        if (testIds.length > 0) {
          await this.jobQueue.cancelByTestIds(testIds);
        }
        const screenshotUrls =
          testIds.length > 0
            ? await this.screenshots.findAllImageUrlsForTests(testIds)
            : [];
        const diffUrls =
          testIds.length > 0
            ? await this.comparisons.findDiffImageUrlsByTestIds(testIds)
            : [];
        await this.branches.deleteById(branchId);
        // Inherited baseline clones share their file with the target branch.
        // Reclaim only URLs that no surviving screenshot/comparison references.
        const staleUrls = await this.screenshots.filterReclaimableUrls([
          ...screenshotUrls,
          ...diffUrls,
        ]);
        return deleted({ staleUrls });
      },
      { retry: DELETION_STATE_CHANGE_RETRY },
    );
  }
}
