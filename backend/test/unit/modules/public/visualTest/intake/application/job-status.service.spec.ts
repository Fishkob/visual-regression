import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JobStatusService } from '@public/visualTest/intake/application/job-status.service';
import { JOB_STATUS_POLLING } from '@public/visualTest/intake/application/job-status-polling';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import {
  ComparisonJobStatusRepository,
  type ComparisonJobStatusRow,
  type ComparisonSummaryRow,
} from '@public/visualTest/intake/infrastructure/repositories/comparison-job-status.repository';
import { ComparisonStatus, JobStatus } from '@/prisma/client';
import { createMock } from '@test/utils/create-mock';

describe('JobStatusService', () => {
  let service: JobStatusService;
  let tests: Mocked<TestResolver>;
  let jobs: Mocked<ComparisonJobStatusRepository>;

  const createdAt = new Date('2025-01-01T00:00:00.000Z');
  const completedAt = new Date('2025-01-01T00:00:01.000Z');

  function makeJob(
    overrides: Partial<ComparisonJobStatusRow> = {},
  ): ComparisonJobStatusRow {
    return {
      id: 'job-1',
      testId: 'test-1',
      status: JobStatus.PENDING,
      candidateId: null,
      error: null,
      createdAt,
      completedAt: null,
      ...overrides,
    };
  }

  function makeComparison(
    overrides: Partial<ComparisonSummaryRow> = {},
  ): ComparisonSummaryRow {
    return {
      id: 'comparison-1',
      status: ComparisonStatus.PENDING_APPROVAL,
      mismatchPixelCount: 42,
      mismatchPageCount: null,
      pageCount: null,
      ...overrides,
    };
  }

  beforeEach(async () => {
    tests = createMock<TestResolver>();
    tests.findTest.mockResolvedValue({
      id: 'test-1',
      name: 'login-form',
      kind: 'image',
      origin: 'branch',
      inheritedFrom: null,
    });
    jobs = createMock<ComparisonJobStatusRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobStatusService,
        { provide: TestResolver, useValue: tests },
        { provide: ComparisonJobStatusRepository, useValue: jobs },
        {
          provide: JOB_STATUS_POLLING,
          useValue: { pollIntervalMs: 1, maxWaitSeconds: 30 },
        },
      ],
    }).compile();

    service = module.get(JobStatusService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws NOT_FOUND when the job belongs to another test', async () => {
    jobs.findByIdForTest.mockResolvedValue(null);

    await expect(
      service.getJobStatus({
        projectName: 'checkout-ui',
        testName: 'login-form',
        jobId: 'other-job',
        waitSeconds: 0,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(tests.findTest).toHaveBeenCalledWith(
      'checkout-ui',
      'login-form',
      undefined,
    );
    expect(jobs.findByIdForTest).toHaveBeenCalledWith('test-1', 'other-job');
  });

  it('returns a pending job immediately when wait is 0', async () => {
    jobs.findByIdForTest.mockResolvedValue(makeJob());

    const result = await service.getJobStatus({
      projectName: 'checkout-ui',
      testName: 'login-form',
      jobId: 'job-1',
      waitSeconds: 0,
    });

    expect(result).toEqual({
      id: 'job-1',
      status: JobStatus.PENDING,
      testId: 'test-1',
      error: null,
      createdAt: createdAt.toISOString(),
      completedAt: null,
      comparison: null,
    });
    expect(jobs.findByIdForTest).toHaveBeenCalledTimes(1);
  });

  it('returns a terminal job at once without waiting', async () => {
    jobs.findByIdForTest.mockResolvedValue(
      makeJob({
        status: JobStatus.COMPLETED,
        candidateId: 'candidate-1',
        completedAt,
      }),
    );
    jobs.findLatestComparisonByCandidate.mockResolvedValue(makeComparison());

    const result = await service.getJobStatus({
      projectName: 'checkout-ui',
      testName: 'login-form',
      jobId: 'job-1',
      waitSeconds: 30,
    });

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(result.completedAt).toBe(completedAt.toISOString());
    expect(result.comparison).toEqual({
      id: 'comparison-1',
      status: ComparisonStatus.PENDING_APPROVAL,
      mismatchPixelCount: 42,
    });
    expect(jobs.findByIdForTest).toHaveBeenCalledTimes(1);
  });

  it('polls until the job completes when wait is greater than 0', async () => {
    jobs.findByIdForTest.mockResolvedValueOnce(makeJob()).mockResolvedValueOnce(
      makeJob({
        status: JobStatus.COMPLETED,
        candidateId: 'candidate-1',
        completedAt,
      }),
    );
    jobs.findLatestComparisonByCandidate.mockResolvedValue(makeComparison());

    const result = await service.getJobStatus({
      projectName: 'checkout-ui',
      testName: 'login-form',
      jobId: 'job-1',
      waitSeconds: 5,
    });

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(result.comparison).not.toBeNull();
    expect(jobs.findByIdForTest).toHaveBeenCalledTimes(2);
  });

  it('stops at the wait deadline and returns the current state', async () => {
    jobs.findByIdForTest.mockResolvedValue(makeJob());
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobStatusService,
        { provide: TestResolver, useValue: tests },
        { provide: ComparisonJobStatusRepository, useValue: jobs },
        {
          provide: JOB_STATUS_POLLING,
          useValue: { pollIntervalMs: 2, maxWaitSeconds: 0.01 },
        },
      ],
    }).compile();
    const shortWaitService = module.get(JobStatusService);

    const startedAt = Date.now();
    const result = await shortWaitService.getJobStatus({
      projectName: 'checkout-ui',
      testName: 'login-form',
      jobId: 'job-1',
      waitSeconds: 30,
    });

    expect(result.status).toBe(JobStatus.PENDING);
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(jobs.findByIdForTest.mock.calls.length).toBeGreaterThan(1);
  });

  it('does not look up a comparison when the job has no candidate', async () => {
    jobs.findByIdForTest.mockResolvedValue(
      makeJob({
        status: JobStatus.COMPLETED,
        candidateId: null,
        completedAt,
      }),
    );

    const result = await service.getJobStatus({
      projectName: 'checkout-ui',
      testName: 'login-form',
      jobId: 'job-1',
      waitSeconds: 0,
    });

    expect(result.comparison).toBeNull();
    expect(jobs.findLatestComparisonByCandidate).not.toHaveBeenCalled();
  });

  it('maps a retired comparison to null', async () => {
    jobs.findByIdForTest.mockResolvedValue(
      makeJob({
        status: JobStatus.COMPLETED,
        candidateId: 'candidate-1',
        completedAt,
      }),
    );
    jobs.findLatestComparisonByCandidate.mockResolvedValue(null);

    const result = await service.getJobStatus({
      projectName: 'checkout-ui',
      testName: 'login-form',
      jobId: 'job-1',
      waitSeconds: 0,
    });

    expect(result.comparison).toBeNull();
    expect(jobs.findLatestComparisonByCandidate).toHaveBeenCalledWith(
      'test-1',
      'candidate-1',
    );
  });

  it('maps PDF page counts when the comparison has them', async () => {
    jobs.findByIdForTest.mockResolvedValue(
      makeJob({
        status: JobStatus.COMPLETED,
        candidateId: 'candidate-1',
        completedAt,
      }),
    );
    jobs.findLatestComparisonByCandidate.mockResolvedValue(
      makeComparison({
        status: ComparisonStatus.APPROVED,
        mismatchPixelCount: 0,
        mismatchPageCount: 2,
        pageCount: 4,
      }),
    );

    const result = await service.getJobStatus({
      projectName: 'pdf-proj',
      testName: 'report',
      jobId: 'job-1',
      waitSeconds: 0,
    });

    expect(result.comparison).toEqual({
      id: 'comparison-1',
      status: ComparisonStatus.APPROVED,
      mismatchPixelCount: 0,
      mismatchPageCount: 2,
      pageCount: 4,
    });
  });

  it('surfaces the error of a FAILED job', async () => {
    jobs.findByIdForTest.mockResolvedValue(
      makeJob({
        status: JobStatus.FAILED,
        candidateId: 'candidate-1',
        error: 'diff engine crashed',
        completedAt,
      }),
    );
    jobs.findLatestComparisonByCandidate.mockResolvedValue(null);

    const result = await service.getJobStatus({
      projectName: 'checkout-ui',
      testName: 'login-form',
      jobId: 'job-1',
      waitSeconds: 0,
    });

    expect(result.status).toBe(JobStatus.FAILED);
    expect(result.error).toBe('diff engine crashed');
    expect(result.completedAt).toBe(completedAt.toISOString());
    expect(result.comparison).toBeNull();
  });
});
