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

  async finishIdleBefore(cutoff: Date): Promise<number> {
    const result = await this.client.run.updateMany({
      where: { finishedAt: null, lastActivityAt: { lt: cutoff } },
      data: { finishedAt: new Date(), finishedBy: 'auto' },
    });
    return result.count;
  }

  async statusCounts(runKey: string): Promise<RunStatusCounts> {
    const [pendingComparisons, pendingJobs, failedJobs, approved] =
      await Promise.all([
        this.client.unifiedComparison.count({
          where: { runKey, status: 'PENDING_APPROVAL' },
        }),
        this.client.comparisonJob.count({
          where: { runKey, status: { in: ['PENDING', 'PROCESSING'] } },
        }),
        this.client.comparisonJob.count({
          where: { runKey, status: 'FAILED' },
        }),
        this.client.approval.count({ where: { runKey } }),
      ]);

    const [jobTests, approvalTests, comparisonTests] = await Promise.all([
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
    const testIds = new Set([
      ...jobTests.map((row) => row.testId),
      ...approvalTests.map((row) => row.testId),
      ...comparisonTests.map((row) => row.testId),
    ]);

    return {
      pendingComparisons,
      pendingJobs,
      failedJobs,
      approved,
      testCount: testIds.size,
    };
  }

  async pendingComparisonsForRun(runKey: string, take: number) {
    return this.client.unifiedComparison.findMany({
      where: { runKey, status: 'PENDING_APPROVAL' },
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

  async approvalsForRun(runKey: string, take: number) {
    return this.client.approval.findMany({
      where: { runKey },
      orderBy: { approvedAt: 'desc' },
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
