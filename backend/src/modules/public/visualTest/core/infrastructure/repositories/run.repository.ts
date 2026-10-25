import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import type { Run } from '@/prisma/client';

export type RunWithBranch = Run & { branch: { name: string } };
import type { RunStatusCounts } from '@public/visualTest/core/domain/types/run.types';

export interface UpsertRunActivityInput {
  projectId: string;
  branchId: string;
  runKey: string;
  commitSha?: string | null;
  commitMessage?: string | null;
  ciUrl?: string | null;
}

@Injectable()
export class RunRepository extends BaseRepository {
  // Uploads are the only writer of a run's activity. A new upload into a
  // finished run reopens it: content that arrived after "finish" means the run
  // is not actually done.
  async upsertActivity(input: UpsertRunActivityInput): Promise<Run> {
    this.assertWritable();
    const now = new Date();
    const metadata = {
      ...(input.commitSha ? { commitSha: input.commitSha } : {}),
      ...(input.commitMessage ? { commitMessage: input.commitMessage } : {}),
      ...(input.ciUrl ? { ciUrl: input.ciUrl } : {}),
    };
    return this.client.run.upsert({
      where: {
        branchId_key: { branchId: input.branchId, key: input.runKey },
      },
      create: {
        projectId: input.projectId,
        branchId: input.branchId,
        key: input.runKey,
        lastActivityAt: now,
        ...metadata,
      },
      update: {
        lastActivityAt: now,
        finishedAt: null,
        finishedBy: null,
        ...metadata,
      },
    });
  }

  async findById(id: string): Promise<RunWithBranch | null> {
    return this.client.run.findUnique({
      where: { id },
      include: { branch: { select: { name: true } } },
    });
  }

  async findByProjectKey(
    projectName: string,
    runKey: string,
  ): Promise<RunWithBranch | null> {
    return this.client.run.findFirst({
      where: { key: runKey, project: { name: projectName } },
      include: { branch: { select: { name: true } } },
    });
  }

  async findByBranchKey(
    branchId: string,
    runKey: string,
  ): Promise<RunWithBranch | null> {
    return this.client.run.findUnique({
      where: { branchId_key: { branchId, key: runKey } },
      include: { branch: { select: { name: true } } },
    });
  }

  async listForProject(
    projectName: string,
    branchId: string | undefined,
    skip: number,
    take: number,
  ): Promise<{ data: RunWithBranch[]; total: number }> {
    return findManyWithCount<RunWithBranch>(this.client.run, {
      where: {
        project: { name: projectName },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      include: { branch: { select: { name: true } } },
    });
  }

  // Finish is a metadata write, not a test-state change: standalone, guarded by
  // `finishedAt: null` so the first finisher wins and a replay is a no-op.
  async finish(id: string, actor?: string | null): Promise<boolean> {
    const result = await this.client.run.updateMany({
      where: { id, finishedAt: null },
      data: { finishedAt: new Date(), finishedBy: actor ?? null },
    });
    return result.count > 0;
  }

  async listRetentionProjects(): Promise<
    { id: string; runHistoryDays: number | null }[]
  > {
    return this.client.project.findMany({
      select: { id: true, runHistoryDays: true },
    });
  }

  async deleteFinishedBefore(projectId: string, cutoff: Date): Promise<number> {
    const result = await this.client.run.deleteMany({
      where: { projectId, finishedAt: { lt: cutoff } },
    });
    return result.count;
  }

  async countFinishedBefore(projectId: string, cutoff: Date): Promise<number> {
    return this.client.run.count({
      where: { projectId, finishedAt: { lt: cutoff } },
    });
  }

  async finishIdleBefore(cutoff: Date): Promise<number> {
    const result = await this.client.run.updateMany({
      where: { finishedAt: null, lastActivityAt: { lt: cutoff } },
      data: { finishedAt: new Date(), finishedBy: 'auto' },
    });
    return result.count;
  }

  async recordUpload(input: {
    runId: string;
    testId: string;
    kind: 'image' | 'pdf';
    viewport: string;
    browser: string;
    environment: string;
    contentHash: string;
    outcome: string;
  }): Promise<void> {
    this.assertWritable();
    await this.client.runUpload.create({ data: input });
  }

  async statusCounts(runId: string): Promise<RunStatusCounts> {
    const [
      pendingComparisons,
      mutedPending,
      pendingJobs,
      failedJobs,
      approved,
    ] = await Promise.all([
      this.client.unifiedComparison.count({
        where: { runId, status: 'PENDING_APPROVAL' },
      }),
      this.client.unifiedComparison.count({
        where: {
          runId,
          status: 'PENDING_APPROVAL',
          test: { mutedUntil: { gt: new Date() } },
        },
      }),
      this.client.comparisonJob.count({
        where: { runId, status: { in: ['PENDING', 'PROCESSING'] } },
      }),
      this.client.comparisonJob.count({
        where: { runId, status: 'FAILED' },
      }),
      this.client.approval.count({ where: { runId } }),
    ]);

    // RunUpload is the durable "this run touched that test" record: baseline
    // uploads have no job/comparison, and approvals delete comparisons.
    const uploads = await this.client.runUpload.findMany({
      where: { runId },
      distinct: ['testId'],
      select: { testId: true },
    });

    return {
      pendingComparisons,
      mutedPending,
      pendingJobs,
      failedJobs,
      approved,
      testCount: uploads.length,
    };
  }

  async pendingComparisonsForRun(runId: string, take: number) {
    return this.client.unifiedComparison.findMany({
      where: { runId, status: 'PENDING_APPROVAL' },
      include: {
        test: {
          select: {
            name: true,
            kind: true,
            branch: {
              select: { name: true, project: { select: { name: true } } },
            },
          },
        },
        baseline: {
          select: {
            variant: {
              select: {
                viewport: true,
                browser: true,
                environment: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  async approvalsForRun(runId: string, take: number) {
    return this.client.approval.findMany({
      where: { runId },
      orderBy: { approvedAt: 'desc' },
      take,
    });
  }

  async failedJobsForRun(runId: string, take: number) {
    return this.client.comparisonJob.findMany({
      where: { runId, status: 'FAILED' },
      include: {
        test: {
          select: {
            name: true,
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  async uploadsForRun(runId: string, take: number) {
    return this.client.runUpload.findMany({
      where: { runId },
      include: {
        test: {
          select: {
            name: true,
            kind: true,
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  async testsForRun(runKey: string): Promise<string[]> {
    const [jobs, approvals, comparisons] = await Promise.all([
      this.client.comparisonJob.findMany({
        where: { runKey },
        distinct: ['testId'],
        select: { testId: true },
      }),
      this.client.approval.findMany({
        where: { runKey },
        distinct: ['testId'],
        select: { testId: true },
      }),
      this.client.unifiedComparison.findMany({
        where: { runKey },
        distinct: ['testId'],
        select: { testId: true },
      }),
    ]);
    return [
      ...new Set([
        ...jobs.map((row) => row.testId),
        ...approvals.map((row) => row.testId),
        ...comparisons.map((row) => row.testId),
      ]),
    ];
  }
}
