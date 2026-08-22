import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DlqService } from '@/modules/internal/dlq/dlq.service';
import { IFailedJobStore } from '@common/domain/job-queue.interface';
import { createMock } from '@test/utils/create-mock';

describe('DlqService', () => {
  let service: DlqService;
  let failedJobs: jest.Mocked<IFailedJobStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    failedJobs = createMock<IFailedJobStore>();
    service = new DlqService(failedJobs);
  });

  it('listFailedJobs delegates to queue and maps to DTOs', async () => {
    const mockJobs = [
      {
        id: 'job-1',
        testId: 'test-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidateHash: 'hash-from-upload',
          candidate: { id: 'candidate-1', url: 'http://storage/candidate.png' },
          baseline: { id: 'b', url: 'http://storage/baseline.png' },
          variant: { viewport: 'v', browser: 'c', environment: 'e' },
        },
        error: 'Comparison failed',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date('2026-07-12'),
      },
    ];
    failedJobs.listFailed.mockResolvedValue(mockJobs as any);

    const result = await service.listFailedJobs();

    expect(failedJobs.listFailed).toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'job-1',
        testId: 'test-1',
        testKind: 'image',
        error: 'Comparison failed',
        attempts: 3,
        maxAttempts: 3,
        createdAt: mockJobs[0].createdAt.toISOString(),
      },
    ]);
  });

  it('maps undecodable failed jobs with unknown testKind instead of crashing', async () => {
    failedJobs.listFailed.mockResolvedValue([
      {
        id: 'job-2',
        testId: 'test-2',
        error: 'boom',
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date('2026-07-12'),
      } as any,
    ]);

    const result = await service.listFailedJobs();

    expect(result).toEqual([
      expect.objectContaining({ id: 'job-2', testKind: 'unknown' }),
    ]);
  });

  it('retryJob delegates to queue', async () => {
    failedJobs.retry.mockResolvedValue('retried');

    await service.retryJob('job-1');

    expect(failedJobs.retry).toHaveBeenCalledWith('job-1');
  });

  it('retryJob throws NotFound when queue reports not-found', async () => {
    failedJobs.retry.mockResolvedValue('not-found');

    await expect(service.retryJob('job-1')).rejects.toThrow('not found');
  });

  it('retryJob throws BadRequest when job is not FAILED', async () => {
    failedJobs.retry.mockResolvedValue('not-failed');

    await expect(service.retryJob('job-1')).rejects.toThrow(
      'not in FAILED status',
    );
  });
});
