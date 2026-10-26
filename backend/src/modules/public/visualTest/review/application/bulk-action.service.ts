import { Injectable } from '@nestjs/common';
import type { ApprovalPrincipal } from '@common/domain/approval-principal';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import {
  ApprovalService,
  type ApproveTarget,
} from '@public/visualTest/review/application/approval.service';
import { ProjectService } from '@public/visualTest/review/application/project.service';

export interface BulkItemResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface BulkPendingVote {
  id: string;
  votes: number;
  required: number;
}

export interface BulkApprovalResult {
  approved: BulkItemResult[];
  pending: BulkPendingVote[];
  failed: BulkItemResult[];
}

// Bulk actions are deliberately a loop over the existing single-item services,
// not a new transaction: one stale comparison/test fails alone, its audit and
// storage retirement still happen per item, and the caller gets an explicit
// per-item result instead of a silent partial success.
@Injectable()
export class BulkActionService {
  constructor(
    private readonly approvals: ApprovalService,
    private readonly deletion: TestDeletionService,
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly tests: UnifiedTestRepository,
    private readonly branches: BranchResolver,
    private readonly projects: ProjectService,
  ) {}

  async approve(
    projectName: string,
    comparisonIds: string[],
    actor: string,
    principal: ApprovalPrincipal,
  ): Promise<BulkApprovalResult> {
    // The selection may span tests and kinds, so each id is paired with its
    // owning test here; the approval itself (kind dispatch, failure policy, vote
    // bookkeeping) belongs to ApprovalService.approveMany.
    const targets: ApproveTarget[] = [];
    const failed: BulkItemResult[] = [];
    for (const comparisonId of comparisonIds) {
      const test = await this.comparisons.findTestOfComparisonById(
        projectName,
        comparisonId,
      );
      if (!test) {
        failed.push({
          id: comparisonId,
          success: false,
          error: 'Comparison not found in this project',
        });
        continue;
      }
      targets.push({
        comparisonId,
        testName: test.name,
        kind: test.kind,
        branchName: test.branch.name,
      });
    }

    const batch = await this.approvals.approveMany(
      projectName,
      targets,
      actor,
      principal,
    );
    return {
      approved: batch.approved.map((id) => ({ id, success: true })),
      pending: batch.pending.map((vote) => ({
        id: vote.comparisonId,
        votes: vote.votes,
        required: vote.required,
      })),
      failed: [
        ...failed,
        ...batch.failed.map((item) => ({
          id: item.comparisonId,
          success: false,
          error: item.error,
        })),
      ],
    };
  }

  async deleteTests(
    projectName: string,
    testNames: string[],
    branchName: string | undefined,
    actor: string,
  ): Promise<{ deleted: BulkItemResult[]; failed: BulkItemResult[] }> {
    const branch = await this.branches.resolveRead(projectName, branchName);
    const deleted: BulkItemResult[] = [];
    const failed: BulkItemResult[] = [];
    for (const testName of testNames) {
      try {
        const test = await this.tests.findByBranchAndTestName(
          branch.branchId,
          testName,
        );
        if (!test) throw new Error('Test not found on this branch');
        await this.deletion.deleteTest(test.id, {
          actor,
          projectName,
          testName,
          branchName: branch.branchName,
        });
        deleted.push({ id: testName, success: true });
      } catch (error) {
        failed.push({
          id: testName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { deleted, failed };
  }

  async moveProjects(
    projectNames: string[],
    groupId: string | null,
  ): Promise<{ moved: BulkItemResult[]; failed: BulkItemResult[] }> {
    const moved: BulkItemResult[] = [];
    const failed: BulkItemResult[] = [];
    for (const projectName of projectNames) {
      try {
        await this.projects.updateProjectGroup(projectName, { groupId });
        moved.push({ id: projectName, success: true });
      } catch (error) {
        failed.push({
          id: projectName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { moved, failed };
  }
}
