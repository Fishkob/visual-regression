import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { UploadRateLimitBucketCleanupTask } from '@internal/data-deletion/tasks/upload-rate-limit-bucket-cleanup.task';
import { createMock } from '@test/utils/create-mock';

describe('UploadRateLimitBucketCleanupTask', () => {
  let task: UploadRateLimitBucketCleanupTask;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      apiKeyRateLimitBucket: { deleteMany: vi.fn() },
    };
    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadRateLimitBucketCleanupTask,
        { provide: PrismaConnection, useValue: mockConnection },
      ],
    }).compile();

    task = module.get(UploadRateLimitBucketCleanupTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes buckets older than 24h and reports the deleted count', async () => {
    mockClient.apiKeyRateLimitBucket.deleteMany.mockResolvedValue({ count: 4 });

    const result = await task.execute();

    expect(mockClient.apiKeyRateLimitBucket.deleteMany).toHaveBeenCalledWith({
      where: { windowStart: { lt: expect.any(Date) } },
    });
    expect(result.gauges?.[0]).toEqual({
      name: expect.stringContaining('cleanup_upload_rate_limit_buckets'),
      value: 4,
    });
  });

  it('emits a zero gauge when nothing was deleted', async () => {
    mockClient.apiKeyRateLimitBucket.deleteMany.mockResolvedValue({ count: 0 });

    const result = await task.execute();

    expect(result.gauges?.[0]?.value).toBe(0);
  });
});
