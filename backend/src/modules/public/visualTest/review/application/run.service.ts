import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import type { ApprovalPrincipal } from '@common/domain/approval-principal';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import {
  RunRepository,
  type RunWithBranch,
} from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import type { RunStatus } from '@public/visualTest/core/domain/types/run.types';
import {
  decideRunState,
  isMutedNow,
} from '@public/visualTest/core/domain/policies/run-state.policy';

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
    // A muted test does not hold the gate (docs/ci-integration.md), so a
    // report that lists this comparison must be able to say so instead of
    // turning it into a failure.
    muted: boolean;
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
  pending: { comparisonId: string; votes: number; required: number }[];
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
    await this.projects.requireByName(projectName);
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
        muted: isMutedNow(row.test.mutedUntil),
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

  // A run-level approve-all is the same batch every other "approve many" uses:
  // the run only supplies the ids. Each approval keeps its own transaction, so a
  // stale one fails alone while the rest still get their chance.
  async approveAll(
    projectName: string,
    runKey: string,
    actor: string,
    principal: ApprovalPrincipal,
    branchName?: string,
  ): Promise<RunApproveAllResult> {
    const run = await this.requireRun(projectName, runKey, branchName);
    const pending = await this.runs.pendingComparisonsForRun(run.id, 500);
    // A muted test does not hold the gate (run-state.policy.ts), so a bulk
    // approval must not silently approve the work its owner deferred: those rows
    // stay pending until the mute is lifted and a reviewer looks at them.
    const reviewable = pending.filter(
      (row) => !isMutedNow(row.test.mutedUntil),
    );
    const batch = await this.approvals.approveMany(
      projectName,
      reviewable.map((row) => ({
        comparisonId: row.id,
        testName: row.test.name,
        kind: row.test.kind,
        branchName: row.test.branch.name,
      })),
      actor,
      principal,
    );
    return {
      approved: batch.approved.length,
      pending: batch.pending,
      failed: batch.failed,
    };
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
    // The gate rule lives in run-state.policy.ts so the share page, the report
    // and this reader cannot answer "is it done?" differently.
    return { ...counts, state: decideRunState(counts, run) };
  }
}
