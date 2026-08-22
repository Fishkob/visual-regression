import { Inject, Injectable } from '@nestjs/common';
import {
  FAILED_JOB_STORE,
  IFailedJobStore,
} from '@common/domain/job-queue.interface';
import { DomainError } from '@common/domain/domain-error';

export interface FailedJobDto {
  id: string;
  testId: string;
  testKind: string;
  error: string;
  attempts: number;
  maxAttempts: number | null;
  createdAt: string;
}

@Injectable()
export class DlqService {
  constructor(
    @Inject(FAILED_JOB_STORE) private readonly failedJobs: IFailedJobStore,
  ) {}

  async listFailedJobs(): Promise<FailedJobDto[]> {
    const jobs = await this.failedJobs.listFailed();

    return jobs.map((job) => ({
      id: job.id,
      testId: job.testId,
      testKind: job.payload?.testKind ?? 'unknown',
      error: job.error ?? 'Unknown error',
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt.toISOString(),
    }));
  }

  async retryJob(jobId: string): Promise<void> {
    const result = await this.failedJobs.retry(jobId);

    if (result === 'not-found') {
      throw new DomainError(`DLQ job ${jobId} not found`, 'NOT_FOUND');
    }
    if (result === 'not-failed') {
      throw new DomainError(
        `Job ${jobId} is not in FAILED status`,
        'BAD_REQUEST',
      );
    }
  }
}
