import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { JobStatus } from '@/prisma/client';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import {
  ComparisonJobStatusRepository,
  type ComparisonJobStatusRow,
  type ComparisonSummaryRow,
} from '@public/visualTest/intake/infrastructure/repositories/comparison-job-status.repository';
import {
  JOB_STATUS_POLLING,
  type JobStatusPollingConfig,
} from '@public/visualTest/intake/application/job-status-polling';
import type { ComparisonJobStatusDto } from '@public/visualTest/intake/presentation/dto/job-status.dto';

export interface GetJobStatusParams {
  projectName: string;
  testName: string;
  jobId: string;
  branch?: string;
  waitSeconds: number;
}

const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  JobStatus.COMPLETED,
  JobStatus.FAILED,
]);

// Read side of the async upload contract: the upload response names the
// ComparisonJob, and a CI client polls this endpoint until the job is terminal.
// The job is always resolved through the effective test of the requested
// branch (findTest, not findOwnTest): an upload may land on a branch whose test
// is inherited or newly materialized, and reading its status is safe.
@Injectable()
export class JobStatusService {
  constructor(
    private readonly tests: TestResolver,
    private readonly jobs: ComparisonJobStatusRepository,
    @Inject(JOB_STATUS_POLLING)
    private readonly polling: JobStatusPollingConfig,
  ) {}

  async getJobStatus(
    params: GetJobStatusParams,
  ): Promise<ComparisonJobStatusDto> {
    const test = await this.tests.findTest(
      params.projectName,
      params.testName,
      params.branch,
    );
    const deadline =
      Date.now() + this.clampWaitSeconds(params.waitSeconds) * 1000;

    let job = await this.loadJob(test.id, params.jobId);
    while (!TERMINAL_JOB_STATUSES.has(job.status) && Date.now() < deadline) {
      await sleep(Math.min(this.polling.pollIntervalMs, deadline - Date.now()));
      job = await this.loadJob(test.id, params.jobId);
    }

    return this.toDto(test.id, job);
  }

  private async loadJob(
    testId: string,
    jobId: string,
  ): Promise<ComparisonJobStatusRow> {
    const job = await this.jobs.findByIdForTest(testId, jobId);
    if (!job) {
      throw new DomainError(`Comparison job "${jobId}" not found`, 'NOT_FOUND');
    }
    return job;
  }

  private async toDto(
    testId: string,
    job: ComparisonJobStatusRow,
  ): Promise<ComparisonJobStatusDto> {
    const comparison = job.candidateId
      ? await this.jobs.findLatestComparisonByCandidate(testId, job.candidateId)
      : null;
    return {
      id: job.id,
      status: job.status,
      testId: job.testId,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      comparison: comparison ? toComparisonDto(comparison) : null,
    };
  }

  // The query DTO rejects >max; this is the service-level backstop so a direct
  // caller can never hold a request open longer than the documented cap.
  private clampWaitSeconds(waitSeconds: number): number {
    if (!Number.isFinite(waitSeconds) || waitSeconds <= 0) return 0;
    return Math.min(waitSeconds, this.polling.maxWaitSeconds);
  }
}

function toComparisonDto(
  comparison: ComparisonSummaryRow,
): NonNullable<ComparisonJobStatusDto['comparison']> {
  return {
    id: comparison.id,
    status: comparison.status,
    mismatchPixelCount: comparison.mismatchPixelCount,
    ...(comparison.mismatchPageCount !== null
      ? { mismatchPageCount: comparison.mismatchPageCount }
      : {}),
    ...(comparison.pageCount !== null
      ? { pageCount: comparison.pageCount }
      : {}),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
