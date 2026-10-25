import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JobStatusController } from '@public/visualTest/intake/presentation/controllers/job-status.controller';
import { JobStatusService } from '@public/visualTest/intake/application/job-status.service';
import { ComparisonStatus, JobStatus } from '@/prisma/client';

describe('JobStatusController', () => {
  let controller: JobStatusController;
  let jobStatus: Mocked<JobStatusService>;

  const projectName = 'checkout-ui';
  const testName = 'login-form';
  const jobId = 'job-1';

  beforeEach(async () => {
    jobStatus = {
      getJobStatus: vi.fn(),
    } as unknown as Mocked<JobStatusService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobStatusController],
      providers: [{ provide: JobStatusService, useValue: jobStatus }],
    }).compile();

    controller = module.get(JobStatusController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the params, branch and wait to the service', async () => {
    const status = {
      id: jobId,
      status: JobStatus.COMPLETED,
      testId: 'test-1',
      error: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:00:01.000Z',
      comparison: {
        id: 'comparison-1',
        status: ComparisonStatus.PENDING_APPROVAL,
        mismatchPixelCount: 12,
      },
    };
    jobStatus.getJobStatus.mockResolvedValue(status);

    const result = await controller.getJobStatus(
      projectName,
      testName,
      jobId,
      { wait: 5 },
      'feature/x',
    );

    expect(result).toBe(status);
    expect(jobStatus.getJobStatus).toHaveBeenCalledWith({
      projectName,
      testName,
      jobId,
      branch: 'feature/x',
      waitSeconds: 5,
    });
  });

  it('defaults wait to 0 when the query omits it', async () => {
    jobStatus.getJobStatus.mockResolvedValue({} as never);

    await controller.getJobStatus(projectName, testName, jobId, {}, undefined);

    expect(jobStatus.getJobStatus).toHaveBeenCalledWith(
      expect.objectContaining({ waitSeconds: 0, branch: undefined }),
    );
  });
});
