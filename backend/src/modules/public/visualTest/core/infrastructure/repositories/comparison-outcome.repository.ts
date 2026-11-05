import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { Prisma } from '@/prisma/client';
import type { TestKind } from '@common/domain/test-kind';

export interface ComparisonOutcomeEntry {
  projectName: string;
  testId: string;
  testName: string;
  kind: TestKind;
  viewport: string;
  browser: string;
  environment: string;
  comparisonId?: string;
  runId?: string;
  runKey?: string;
  outcome: 'unchanged' | 'within_threshold' | 'changed';
  mismatchMetric: number;
}

export interface DailyOutcomeCount {
  date: string;
  changed: number;
  unchanged: number;
  withinThreshold: number;
}

export interface ReviewReasonBreakdown {
  intendedChange: number;
  flake: number;
  infra: number;
  noReason: number;
  withReason: number;
  knownNoise: number;
  knownNoiseRate: number;
}

export interface TrendWindow {
  daily: DailyOutcomeCount[];
  pendingReview: { count: number; avgSeconds: number; maxSeconds: number };
  approvalLatency: { count: number; avgSeconds: number };
  flakeRate: { flakyTests: number; totalTests: number; rate: number };
  reviewReasons: ReviewReasonBreakdown;
}

@Injectable()
export class ComparisonOutcomeRepository extends BaseRepository {
  // Analytics write, deliberately outside the comparison transaction: losing a
  // trend row must never roll back a comparison, and the row carries everything
  // the report needs (project, names, variant, run) so no joins are required
  // later — a join would drop the row once its test is deleted.
  async record(entry: ComparisonOutcomeEntry): Promise<void> {
    await this.client.comparisonOutcomeEvent.create({ data: entry });
  }

  async eventsForTest(testId: string, since: Date) {
    return this.client.comparisonOutcomeEvent.findMany({
      where: { testId, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { outcome: true, createdAt: true },
    });
  }

  async trends(projectId: string, since: Date): Promise<TrendWindow> {
    // Five independent aggregates over four tables; they used to run one after
    // another, so the trends page paid a round-trip per aggregate in series.
    const [daily, pending, approval, flake, reasons] = await Promise.all([
      this.client.$queryRaw<
        {
          date: Date;
          changed: bigint;
          unchanged: bigint;
          within_threshold: bigint;
        }[]
      >(Prisma.sql`
      SELECT date_trunc('day', e."createdAt") AS date,
             COUNT(*) FILTER (WHERE e.outcome = 'changed') AS changed,
             COUNT(*) FILTER (WHERE e.outcome = 'unchanged') AS unchanged,
             COUNT(*) FILTER (WHERE e.outcome = 'within_threshold') AS within_threshold
      FROM "ComparisonOutcomeEvent" e
      WHERE e."projectId" = ${projectId} AND e."createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
      this.client.$queryRaw<
        {
          count: bigint;
          avg_seconds: number | null;
          max_seconds: number | null;
        }[]
      >(Prisma.sql`
      SELECT COUNT(*) AS count,
             AVG(EXTRACT(EPOCH FROM (NOW() - c."createdAt"))) AS avg_seconds,
             MAX(EXTRACT(EPOCH FROM (NOW() - c."createdAt"))) AS max_seconds
      FROM "UnifiedComparison" c
      JOIN "UnifiedTest" t ON t.id = c."testId"
      JOIN "Branch" b ON b.id = t."branchId"
      JOIN "Project" p ON p.id = b."projectId"
      WHERE p.id = ${projectId} AND c.status = 'PENDING_APPROVAL'
    `),
      this.client.$queryRaw<
        { count: bigint; avg_seconds: number | null }[]
      >(Prisma.sql`
      SELECT COUNT(*) AS count,
             AVG(EXTRACT(EPOCH FROM (a."approvedAt" - e."createdAt"))) AS avg_seconds
      FROM "Approval" a
      JOIN "ComparisonOutcomeEvent" e ON e."comparisonId" = a."comparisonId"
      WHERE a."projectId" = ${projectId} AND a."approvedAt" >= ${since}
    `),
      this.client.$queryRaw<{ flaky: bigint; total: bigint }[]>(Prisma.sql`
      WITH per_test AS (
        SELECT e."testId",
               COUNT(*) FILTER (WHERE e.outcome = 'changed') AS changed,
               COUNT(*) FILTER (WHERE e.outcome IN ('unchanged', 'within_threshold')) AS clean
        FROM "ComparisonOutcomeEvent" e
        WHERE e."projectId" = ${projectId} AND e."createdAt" >= ${since}
        GROUP BY e."testId"
      )
      SELECT COUNT(*) FILTER (WHERE changed > 0 AND clean > 0) AS flaky,
             COUNT(*) AS total
      FROM per_test
    `),
      this.client.approval.groupBy({
        by: ['reason'],
        where: { projectId, approvedAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const flakyTests = Number(flake[0]?.flaky ?? 0);
    const totalTests = Number(flake[0]?.total ?? 0);

    // A bulk approval deliberately writes no reason (ADR-040), so "no reason" is
    // its own bucket: the noise share only means something over the reviews that
    // made a statement, and a pending nobody has judged yet is not part of it.
    const counted = { intendedChange: 0, flake: 0, infra: 0, noReason: 0 };
    for (const row of reasons) {
      const count = row._count._all;
      if (row.reason === 'INTENDED_CHANGE') counted.intendedChange += count;
      else if (row.reason === 'FLAKE') counted.flake += count;
      else if (row.reason === 'INFRA') counted.infra += count;
      else counted.noReason += count;
    }
    const withReason = counted.intendedChange + counted.flake + counted.infra;
    const knownNoise = counted.flake + counted.infra;

    return {
      daily: daily.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        changed: Number(row.changed),
        unchanged: Number(row.unchanged),
        withinThreshold: Number(row.within_threshold),
      })),
      pendingReview: {
        count: Number(pending[0]?.count ?? 0),
        avgSeconds: Math.round(pending[0]?.avg_seconds ?? 0),
        maxSeconds: Math.round(pending[0]?.max_seconds ?? 0),
      },
      approvalLatency: {
        count: Number(approval[0]?.count ?? 0),
        avgSeconds: Math.round(approval[0]?.avg_seconds ?? 0),
      },
      flakeRate: {
        flakyTests,
        totalTests,
        rate: totalTests === 0 ? 0 : flakyTests / totalTests,
      },
      reviewReasons: {
        ...counted,
        withReason,
        knownNoise,
        knownNoiseRate: withReason === 0 ? 0 : knownNoise / withReason,
      },
    };
  }
}
