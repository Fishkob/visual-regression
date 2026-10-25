import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import {
  RunRepository,
  type RunWithBranch,
} from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import type {
  RunState,
  RunStatus,
} from '@public/visualTest/core/domain/types/run.types';

export interface RunDetail {
  run: RunWithBranch;
  status: RunStatus;
  pending: {
    comparisonId: string;
    testName: string;
    kind: string;
    branchName: string;
    variant: { viewport: string; browser: string; environment: string };
    mismatchPixelCount: number;
    mismatchPageCount: number | null;
    createdAt: Date;
  }[];
  approvals: {
    comparisonId: string;
    testName: string;
    approvedBy: string;
    approvedAt: Date;
  }[];
  uploads: {
    testName: string;
    kind: string;
    variant: { viewport: string; browser: string; environment: string };
    outcome: string;
    createdAt: Date;
  }[];
  failedJobs: {
    id: string;
    testName: string;
    branchName: string;
    error: string;
    createdAt: Date;
  }[];
}

export interface RunApproveAllResult {
  approved: number;
  failed: { comparisonId: string; error: string }[];
}

@Injectable()
export class RunService {
  constructor(
    private readonly runs: RunRepository,
    private readonly branches: BranchResolver,
    private readonly projects: ProjectRepository,
    private readonly approvals: ApprovalService,
  ) {}

  async list(
    projectName: string,
    branchName: string | undefined,
    skip: number,
    take: number,
  ): Promise<{ data: RunWithBranch[]; total: number }> {
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    const branch = branchName
      ? await this.branches.resolveRead(projectName, branchName)
      : undefined;
    return this.runs.listForProject(projectName, branch?.branchId, skip, take);
  }

  async status(
    projectName: string,
    runKey: string,
    branchName?: string,
  ): Promise<{ run: RunWithBranch; status: RunStatus }> {
    const run = await this.requireRun(projectName, runKey, branchName);
    return { run, status: await this.computeStatus(run) };
  }

  async detail(
    projectName: string,
    runKey: string,
    branchName?: string,
  ): Promise<RunDetail> {
    const run = await this.requireRun(projectName, runKey, branchName);
    const status = await this.computeStatus(run);
    const [pendingRows, approvals, uploadRows, failedJobRows] =
      await Promise.all([
        this.runs.pendingComparisonsForRun(run.id, 200),
        this.runs.approvalsForRun(run.id, 100),
        this.runs.uploadsForRun(run.id, 200),
        this.runs.failedJobsForRun(run.id, 100),
      ]);
    return {
      run,
      status,
      pending: pendingRows.map((row) => ({
        comparisonId: row.id,
        testName: row.test.name,
        kind: row.test.kind,
        branchName: row.test.branch.name,
        variant: {
          viewport: row.baseline.variant?.viewport ?? '',
          browser: row.baseline.variant?.browser ?? '',
          environment: row.baseline.variant?.environment ?? '',
        },
        mismatchPixelCount: row.mismatchPixelCount,
        mismatchPageCount: row.mismatchPageCount ?? null,
        createdAt: row.createdAt,
      })),
      approvals: approvals.map((row) => ({
        comparisonId: row.comparisonId,
        testName: row.testName,
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
      })),
      uploads: uploadRows.map((row) => ({
        testName: row.test.name,
        kind: row.kind,
        variant: {
          viewport: row.viewport,
          browser: row.browser,
          environment: row.environment,
        },
        outcome: row.outcome,
        createdAt: row.createdAt,
      })),
      failedJobs: failedJobRows.map((row) => ({
        id: row.id,
        testName: row.test.name,
        branchName: row.test.branch.name,
        error: row.error ?? 'Comparison failed',
        createdAt: row.createdAt,
      })),
    };
  }

  async finish(
    projectName: string,
    runKey: string,
    actor?: string,
    branchName?: string,
  ): Promise<{ run: RunWithBranch; status: RunStatus }> {
    const run = await this.requireRun(projectName, runKey, branchName);
    await this.runs.finish(run.id, actor);
    const refreshed = (await this.runs.findById(run.id)) ?? run;
    return { run: refreshed, status: await this.computeStatus(refreshed) };
  }

  // A run-level approve-all is a loop over the run's pending comparisons, not
  // a transaction: each approval keeps its own audit/retirement/audit row and a
  // stale one fails alone while the rest still get their chance.
  async approveAll(
    projectName: string,
    runKey: string,
    actor: string,
    branchName?: string,
  ): Promise<RunApproveAllResult> {
    const run = await this.requireRun(projectName, runKey, branchName);
    const pending = await this.runs.pendingComparisonsForRun(run.id, 500);
    const result: RunApproveAllResult = { approved: 0, failed: [] };
    for (const row of pending) {
      try {
        if (row.test.kind === 'image') {
          await this.approvals.approveImage(
            projectName,
            row.test.name,
            row.id,
            actor,
            row.test.branch.name,
          );
        } else {
          await this.approvals.approvePdf(
            projectName,
            row.test.name,
            row.id,
            actor,
            row.test.branch.name,
          );
        }
        result.approved += 1;
      } catch (error) {
        result.failed.push({
          comparisonId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }

  private async requireRun(
    projectName: string,
    runKey: string,
    branchName?: string,
  ): Promise<RunWithBranch> {
    const branch = await this.branches.resolveRead(projectName, branchName);
    const run = await this.runs.findByBranchKey(branch.branchId, runKey);
    if (!run) {
      throw new DomainError(
        `Run "${runKey}" not found on branch "${branch.branchName}"`,
        'NOT_FOUND',
      );
    }
    return run;
  }

  private async computeStatus(run: RunWithBranch): Promise<RunStatus> {
    const counts = await this.runs.statusCounts(run.id);
    return { ...counts, state: this.stateOf(run, counts) };
  }

  private stateOf(
    run: RunWithBranch,
    counts: {
      pendingComparisons: number;
      pendingJobs: number;
      failedJobs: number;
    },
  ): RunState {
    if (counts.failedJobs > 0) return 'failed';
    if (counts.pendingComparisons > 0 || counts.pendingJobs > 0) {
      return 'pending';
    }
    return run.finishedAt ? 'passed' : 'open';
  }
}
