import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { JobStatus } from '@/prisma/client';
import type { ComparisonStatus } from '@/prisma/client';
import { REVIEWABLE_COMPARISON_ORDER } from '@public/visualTest/core/domain/types/visual-test.types';

export interface ComparisonJobStatusRow {
  id: string;
  testId: string;
  status: JobStatus;
  candidateId: string | null;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface ComparisonSummaryRow {
  id: string;
  status: ComparisonStatus;
  mismatchPixelCount: number;
  mismatchPageCount: number | null;
  pageCount: number | null;
}

// Read-only projection for the upload-status endpoint. It rides the bare
// connection (no transaction assert, no StateChangeWorkflow) because polling a
// job must never occupy a DB transaction; every method is a single scoped
// SELECT.
@Injectable()
export class ComparisonJobStatusRepository extends BaseRepository {
  async findByIdForTest(
    testId: string,
    jobId: string,
  ): Promise<ComparisonJobStatusRow | null> {
    return this.client.comparisonJob.findFirst({
      where: { id: jobId, testId },
      select: {
        id: true,
        testId: true,
        status: true,
        candidateId: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }

  // The comparison a job produced, identified by its candidate. The candidate
  // link is stable for the job's lifetime; a retired (deleted) or approved-away
  // (candidate detached) comparison simply returns null.
  async findLatestComparisonByCandidate(
    testId: string,
    candidateId: string,
  ): Promise<ComparisonSummaryRow | null> {
    return this.client.unifiedComparison.findFirst({
      where: { testId, candidateId },
      orderBy: REVIEWABLE_COMPARISON_ORDER,
      select: {
        id: true,
        status: true,
        mismatchPixelCount: true,
        mismatchPageCount: true,
        pageCount: true,
      },
    });
  }
}
