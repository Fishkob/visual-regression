import { Test, TestingModule } from '@nestjs/testing';
import { FailedJobStore } from '@internal/job-queue/failed-job.store';
import { TransactionContext } from '@/prisma/transaction-context';
import type { JobData } from '@common/domain/job-data.types';

const jobPayload: JobData = {
  testKind: 'image',
  projectName: 'shop',
  testId: 'test-1',
  candidateHash: 'hash-from-upload',
  candidate: { id: 'candidate-1', url: 'http://storage/candidate.png' },
  baseline: { id: 'b', url: 'http://storage/baseline.png' },
  variant: { viewport: 'v', browser: 'c', environment: 'e' },
};

describe('FailedJobStore', () => {
  let service: FailedJobStore;
  let prisma: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    prisma = {
      client: {
        comparisonJob: {
          findMany: vi.fn(),
          updateMany: vi.fn(),
          findUnique: vi.fn(),
          deleteMany: vi.fn(),
        },
        $queryRawUnsafe: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FailedJobStore,
        { provide: TransactionContext, useValue: prisma },
      ],
    }).compile();

    service = module.get(FailedJobStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('listFailed', () => {
    it('lists FAILED jobs newest-first with the shared projection', async () => {
      const rows = [
        {
          id: 'job-1',
          testId: 'test-1',
          payload: jobPayload,
          error: 'boom',
          attempts: 3,
          maxAttempts: 3,
          createdAt: new Date('2024-11-01T00:00:00Z'),
        },
      ];
      prisma.client.comparisonJob.findMany.mockResolvedValue(rows);

      const result = await service.listFailed();

      expect(result).toEqual(rows);
      expect(prisma.client.comparisonJob.findMany).toHaveBeenCalledWith({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          testId: true,
          candidateId: true,
          payload: true,
          error: true,
          attempts: true,
          maxAttempts: true,
          createdAt: true,
        },
      });
    });
  });

  describe('findFailedJobs', () => {
    it('finds failed jobs older than retention period and maps them', async () => {
      const rows = [
        {
          id: 'job-1',
          testId: 'test-1',
          payload: jobPayload,
          error: 'boom',
          attempts: 3,
          maxAttempts: 3,
          createdAt: new Date('2024-11-01T00:00:00Z'),
        },
      ];
      prisma.client.comparisonJob.findMany.mockResolvedValue(rows);

      const result = await service.findFailedJobs(30);

      expect(result).toEqual(rows);
      expect(prisma.client.comparisonJob.findMany).toHaveBeenCalledWith({
        where: {
          status: 'FAILED',
          completedAt: { lte: new Date('2024-12-02T00:00:00Z') },
        },
        orderBy: { completedAt: 'asc' },
        take: 500,
        select: {
          id: true,
          testId: true,
          candidateId: true,
          payload: true,
          error: true,
          attempts: true,
          maxAttempts: true,
          createdAt: true,
        },
      });
    });

    it('does not throw when a failed job payload is malformed', async () => {
      const rows = [
        {
          id: 'job-broken',
          testId: 'test-1',
          payload: { garbage: true },
          error: 'boom',
          attempts: 3,
          maxAttempts: 3,
          createdAt: new Date('2024-11-01T00:00:00Z'),
        },
      ];
      prisma.client.comparisonJob.findMany.mockResolvedValue(rows);

      const result = await service.findFailedJobs(30);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('job-broken');
      expect(result[0].payload).toBeUndefined();
    });

    it('returns empty array when no failed jobs match', async () => {
      prisma.client.comparisonJob.findMany.mockResolvedValue([]);

      const result = await service.findFailedJobs(7);

      expect(result).toEqual([]);
    });
  });

  describe('deleteFailedJobRows', () => {
    it('deletes DB rows guarded by FAILED status and returns the deleted ids', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        { id: 'job-1' },
        { id: 'job-2' },
      ]);

      const result = await service.deleteFailedJobRows(['job-1', 'job-2']);

      expect(result).toEqual(['job-1', 'job-2']);
      expect(prisma.client.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "ComparisonJob"'),
        ['job-1', 'job-2'],
        'FAILED',
      );
    });

    it('does nothing for an empty id list', async () => {
      const result = await service.deleteFailedJobRows([]);

      expect(result).toEqual([]);
      expect(prisma.client.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('deleteCompletedJobs', () => {
    it('deletes COMPLETED rows older than the retention cutoff', async () => {
      prisma.client.comparisonJob.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteCompletedJobs(7);

      expect(result).toBe(3);
      expect(prisma.client.comparisonJob.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'COMPLETED',
          completedAt: { lte: new Date('2024-12-25T00:00:00Z') },
        },
      });
    });

    it('returns zero when no completed rows match', async () => {
      prisma.client.comparisonJob.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deleteCompletedJobs(30);

      expect(result).toBe(0);
    });
  });

  describe('retry', () => {
    it('resets a FAILED job to PENDING', async () => {
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.retry('job-1');

      expect(result).toBe('retried');
      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', status: 'FAILED' },
        data: {
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: expect.any(Date),
          error: null,
          completedAt: null,
        },
      });
    });

    it('reports not-found when the row does not exist', async () => {
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 0 });
      prisma.client.comparisonJob.findUnique.mockResolvedValue(null);

      const result = await service.retry('missing');

      expect(result).toBe('not-found');
    });

    it('reports not-failed when the row exists but is not FAILED', async () => {
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 0 });
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'PROCESSING',
      });

      const result = await service.retry('job-1');

      expect(result).toBe('not-failed');
    });
  });
});
