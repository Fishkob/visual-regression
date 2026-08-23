import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PostgresJobQueue } from '@internal/job-queue/postgres-job-queue';
import { TransactionContext } from '@/prisma/transaction-context';
import { Tracker } from '@common/tracker/tracker.service';
import { MetricsService } from '@internal/metrics/metrics.service';
import { METRICS_RECORDER } from '@common/domain/metrics-recorder.interface';
import type { JobData } from '@common/domain/job-data.types';
import { DomainError } from '@common/domain/domain-error';
import type { VariantRecord } from '@common/domain/variant-record';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

function imageJobData(testId: string): JobData {
  return {
    testKind: 'image',
    testId,
    candidateHash: 'hash-from-upload',
    candidate: {
      id: `candidate-${testId}`,
      url: 'http://storage/candidate.png',
    },
    baseline: { id: 'b', url: 'http://storage/baseline.png' },
    variant: { viewport: 'v', browser: 'c', environment: 'e' },
  };
}

function pdfJobData(testId: string): JobData {
  return {
    testKind: 'pdf',
    testId,
    candidateHash: 'hash-from-upload',
    candidate: {
      id: `candidate-${testId}`,
      url: 'http://storage/candidate.pdf',
    },
    baseline: { id: 'b', url: 'http://storage/baseline.pdf' },
    variant: { viewport: 'v', browser: 'c', environment: 'e' },
  };
}

const jobPayload: JobData = {
  testKind: 'image',
  testId: 'test-1',
  candidateHash: 'hash-from-upload',
  candidate: { id: 'candidate-1', url: 'http://storage/candidate.png' },
  baseline: { id: 'b', url: 'http://storage/baseline.png' },
  variant: { viewport: 'v', browser: 'c', environment: 'e' },
};

describe('PostgresJobQueue', () => {
  let queue: PostgresJobQueue;
  let prisma: any;
  let tracker: Mocked<Tracker>;
  let metrics: Mocked<MetricsService>;
  let logger: Mocked<AppLoggerService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    prisma = {
      client: {
        comparisonJob: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
          count: vi.fn(),
        },
        $queryRawUnsafe: vi.fn(),
        $executeRaw: vi.fn(),
        $transaction: vi.fn((cb: (tx: any) => any) => cb(prisma.client)),
      },
      assertInTransaction: vi.fn(),
    };

    tracker = createMock<Tracker>();
    tracker.track.mockImplementation(
      (_op: string, fn: () => Promise<unknown>) => fn(),
    );

    metrics = createMock<MetricsService>();
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresJobQueue,
        { provide: TransactionContext, useValue: prisma },
        { provide: Tracker, useValue: tracker },
        { provide: AppLoggerService, useValue: logger },
        { provide: METRICS_RECORDER, useValue: metrics },
      ],
    }).compile();

    queue = module.get(PostgresJobQueue);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('cancelByTestIds', () => {
    it('deletes pending jobs for multiple test ids in one query', async () => {
      prisma.client.comparisonJob.deleteMany.mockResolvedValue({ count: 4 });

      const result = await queue.cancelByTestIds(['vt-1', 'vt-2']);

      expect(result).toBe(4);
      expect(prisma.client.comparisonJob.deleteMany).toHaveBeenCalledWith({
        where: { testId: { in: ['vt-1', 'vt-2'] }, status: 'PENDING' },
      });
    });

    it('returns 0 without querying for an empty id list', async () => {
      const result = await queue.cancelByTestIds([]);

      expect(result).toBe(0);
      expect(prisma.client.comparisonJob.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('cancelPendingForVariant', () => {
    it('deletes pending jobs whose variant columns match all three dimensions', async () => {
      prisma.client.comparisonJob.deleteMany.mockResolvedValue({ count: 2 });

      const variant: VariantRecord = {
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
      };
      const result = await queue.cancelPendingForVariant('vt-1', variant);

      expect(result).toBe(2);
      expect(prisma.client.comparisonJob.deleteMany).toHaveBeenCalledWith({
        where: {
          testId: 'vt-1',
          status: 'PENDING',
          variantViewport: '1920x1080',
          variantBrowser: 'Chrome',
          variantEnvironment: 'staging',
        },
      });
    });
  });

  describe('cancelPendingByCandidateIds', () => {
    it('fails loudly when called outside a workflow transaction', async () => {
      prisma.assertInTransaction.mockImplementation(() => {
        throw new Error(
          'Operation requires an active StateChangeWorkflow transaction',
        );
      });

      await expect(
        queue.cancelPendingByCandidateIds(['candidate-1']),
      ).rejects.toThrow(/requires an active StateChangeWorkflow transaction/);
      expect(prisma.client.comparisonJob.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes pending jobs whose candidateId is in the given ids', async () => {
      prisma.client.comparisonJob.deleteMany.mockResolvedValue({ count: 2 });

      const result = await queue.cancelPendingByCandidateIds([
        'candidate-1',
        'candidate-2',
      ]);

      expect(result).toBe(2);
      expect(prisma.client.comparisonJob.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING',
          candidateId: { in: ['candidate-1', 'candidate-2'] },
        },
      });
    });

    it('returns 0 and does not query when ids are empty', async () => {
      const result = await queue.cancelPendingByCandidateIds([]);

      expect(result).toBe(0);
      expect(prisma.client.comparisonJob.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('enqueue', () => {
    it('creates a job with testId for image tests', async () => {
      prisma.client.comparisonJob.create.mockResolvedValue({ id: 'job-1' });

      const result = await queue.enqueue(imageJobData('vt-1'));

      expect(result).toBe('job-1');
      expect(prisma.client.comparisonJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          testId: 'vt-1',
          maxAttempts: 3,
          payload: expect.objectContaining({
            testKind: 'image',
            testId: 'vt-1',
          }),
        }),
      });
    });

    it('creates a job with testId for pdf tests', async () => {
      prisma.client.comparisonJob.create.mockResolvedValue({ id: 'job-2' });

      const result = await queue.enqueue(pdfJobData('pdf-1'));

      expect(result).toBe('job-2');
      expect(prisma.client.comparisonJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          testId: 'pdf-1',
        }),
      });
    });

    it('defaults maxAttempts to the queue maximum when none is provided', async () => {
      prisma.client.comparisonJob.create.mockResolvedValue({ id: 'job-3' });

      await queue.enqueue(imageJobData('vt-1'));

      expect(prisma.client.comparisonJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maxAttempts: 3,
        }),
      });
    });

    it('writes candidateId and variant dimensions as columns on create', async () => {
      prisma.client.comparisonJob.create.mockResolvedValue({ id: 'job-5' });

      await queue.enqueue(imageJobData('vt-5'));

      expect(prisma.client.comparisonJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: 'candidate-vt-5',
          variantViewport: 'v',
          variantBrowser: 'c',
          variantEnvironment: 'e',
        }),
      });
    });

    it('includes trace context in the payload', async () => {
      prisma.client.comparisonJob.create.mockResolvedValue({ id: 'job-4' });

      await queue.enqueue(imageJobData('vt-1'));

      const call = prisma.client.comparisonJob.create.mock.calls[0][0];
      expect(call.data.payload.traceContext).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('returns counts for pending, processing, and failed jobs', async () => {
      prisma.client.comparisonJob.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2);

      const result = await queue.healthCheck();

      expect(result).toEqual({ pending: 10, processing: 3, failed: 2 });
      expect(prisma.client.comparisonJob.count).toHaveBeenCalledTimes(3);
    });

    it('reports failed count to metrics via setGauge', async () => {
      prisma.client.comparisonJob.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2);

      await queue.healthCheck();

      expect(metrics.setGauge).toHaveBeenCalledWith('queue_failed_jobs', 2, {
        queue: 'comparison',
      });
    });
  });

  describe('claimNext', () => {
    it('claims the next available pending job', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([{ id: 'job-1' }]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'PROCESSING',
        payload: jobPayload,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: null,
      });

      const processor = vi.fn().mockResolvedValue(undefined);
      prisma.client.comparisonJob.updateMany.mockResolvedValue({
        count: 1,
      });

      await queue.processNext(processor);

      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'job-1' }),
      );
      expect(prisma.client.$transaction).toHaveBeenCalled();
      expect(prisma.client.$queryRawUnsafe).toHaveBeenCalled();
      expect(prisma.client.comparisonJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: {
          status: 'PROCESSING',
          processingStartedAt: expect.any(Date),
          heartbeatAt: expect.any(Date),
        },
      });
    });

    it('returns null when no job available', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([]);

      const processor = vi.fn();
      await queue.processNext(processor);

      expect(processor).not.toHaveBeenCalled();
      expect(prisma.client.comparisonJob.update).not.toHaveBeenCalled();
      expect(prisma.client.comparisonJob.findUnique).not.toHaveBeenCalled();
    });

    it('claims stalled jobs and increments their attempts', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'stalled-job',
          status: 'PROCESSING',
          attempts: 1,
          maxAttempts: 3,
        },
      ]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'stalled-job',
        status: 'PROCESSING',
        payload: jobPayload,
        attempts: 2,
        maxAttempts: 3,
      });

      const processor = vi.fn().mockResolvedValue(undefined);
      prisma.client.comparisonJob.updateMany.mockResolvedValue({
        count: 1,
      });

      await queue.processNext(processor);

      expect(processor).toHaveBeenCalled();
      expect(prisma.client.comparisonJob.update).toHaveBeenCalledWith({
        where: { id: 'stalled-job' },
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: 2,
        }),
      });
    });

    it('moves an exhausted stalled job to FAILED instead of processing it', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'exhausted-job',
          status: 'PROCESSING',
          attempts: 2,
          maxAttempts: 3,
        },
      ]);
      prisma.client.comparisonJob.update.mockResolvedValue({});

      const processor = vi.fn();
      await queue.processNext(processor);

      expect(processor).not.toHaveBeenCalled();
      expect(prisma.client.comparisonJob.update).toHaveBeenCalledWith({
        where: { id: 'exhausted-job' },
        data: expect.objectContaining({
          status: 'FAILED',
          attempts: 3,
        }),
      });
    });

    it('claims jobs whose heartbeat is stale', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'hung-job',
          status: 'PROCESSING',
          attempts: 0,
          maxAttempts: 3,
        },
      ]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'hung-job',
        status: 'PROCESSING',
        payload: jobPayload,
        attempts: 0,
        maxAttempts: 3,
      });

      const processor = vi.fn().mockResolvedValue(undefined);
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 1 });

      await queue.processNext(processor);

      expect(prisma.client.comparisonJob.update).toHaveBeenCalledWith({
        where: { id: 'hung-job' },
        data: expect.objectContaining({ status: 'PROCESSING' }),
      });
    });

    it('reclaims stalled PROCESSING jobs by heartbeat staleness only', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([]);

      await queue.processNext(vi.fn());

      const [sql, ...params] = prisma.client.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('"heartbeatAt" < $3');
      expect(sql).not.toContain('processingStartedAt');
      expect(params).toHaveLength(3);
    });

    it('also reclaims PROCESSING jobs whose heartbeatAt is NULL (never beat)', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([]);

      await queue.processNext(vi.fn());

      const [sql] = prisma.client.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('"heartbeatAt" IS NULL');
    });

    it('a stalled-then-failed job consumes exactly one budget unit per run (crash counted once at reclaim, failure once at markFailed)', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'stalled-job',
          status: 'PROCESSING',
          attempts: 0,
          maxAttempts: 3,
        },
      ]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'stalled-job',
        status: 'PROCESSING',
        payload: jobPayload,
        attempts: 1,
        maxAttempts: 3,
      });
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 1 });

      const processor = vi
        .fn()
        .mockRejectedValue(new Error('transient after crash'));
      await queue.processNext(processor);

      expect(prisma.client.comparisonJob.update).toHaveBeenCalledWith({
        where: { id: 'stalled-job' },
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: 1,
        }),
      });
      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            attempts: 2,
          }),
        }),
      );
    });

    it('does not throw and fails a job with an undecodable payload immediately', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        { id: 'poison-job', status: 'PENDING', attempts: 0, maxAttempts: 3 },
      ]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'poison-job',
        testId: 'test-1',
        status: 'PROCESSING',
        payload: { testKind: 'image' },
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: null,
        processingStartedAt: new Date('2025-01-01T00:00:00Z'),
        error: null,
      });
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 1 });

      const processor = vi.fn();
      const result = await queue.processNext(processor);

      expect(result).toBe(false);
      expect(processor).not.toHaveBeenCalled();
      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            error: expect.stringContaining('Malformed job data'),
          }),
        }),
      );
    });
  });

  const heartbeatStartedAt = new Date('2025-01-01T00:00:00Z');

  function claimProcessingJob(id = 'job-1') {
    prisma.client.$queryRawUnsafe.mockResolvedValue([
      { id, status: 'PROCESSING', attempts: 0, maxAttempts: 3 },
    ]);
    prisma.client.comparisonJob.update.mockResolvedValue({});
    prisma.client.comparisonJob.findUnique.mockResolvedValue({
      id,
      status: 'PROCESSING',
      payload: jobPayload,
      attempts: 0,
      maxAttempts: 3,
      processingStartedAt: heartbeatStartedAt,
    });
  }

  // Runs processNext with a processor that stays pending until `finish` is
  // called, so the heartbeat interval stays alive long enough to observe it.
  function startProcessing(id = 'job-1'): {
    processing: Promise<boolean>;
    finish: () => void;
  } {
    claimProcessingJob(id);
    prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 1 });

    let finish: (() => void) | undefined;
    const processor = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    return {
      processing: queue.processNext(processor),
      // finish is assigned lazily when the processor runs; read it at call time.
      finish: () => finish?.(),
    };
  }

  function heartbeatCalls(): number {
    return prisma.client.comparisonJob.updateMany.mock.calls.filter(
      ([args]: unknown[]) => 'heartbeatAt' in (args as { data: object }).data,
    ).length;
  }

  // claimNext resolves through several mocked awaits; a single await only
  // advances one microtask level, so drain the chain deterministically.
  async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  }

  describe('heartbeat', () => {
    it('starts sending heartbeats at interval with an ownership guard', async () => {
      const { processing, finish } = startProcessing();

      await flushMicrotasks();
      vi.advanceTimersByTime(5000);

      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'job-1',
          status: 'PROCESSING',
          processingStartedAt: heartbeatStartedAt,
        },
        data: { heartbeatAt: expect.any(Date) },
      });

      finish();
      await processing;
    });

    it('sends heartbeats repeatedly at 5s interval', async () => {
      const { processing, finish } = startProcessing();

      await flushMicrotasks();
      vi.advanceTimersByTime(15000);

      expect(heartbeatCalls()).toBe(3);

      finish();
      await processing;
    });

    it('stops sending heartbeats for the given job', async () => {
      const { processing, finish } = startProcessing();

      await flushMicrotasks();
      finish();
      await processing;

      vi.advanceTimersByTime(10000);

      expect(heartbeatCalls()).toBe(0);
    });

    it('does not affect heartbeats for other jobs', async () => {
      const first = startProcessing('job-1');
      await flushMicrotasks();
      const second = startProcessing('job-2');
      await flushMicrotasks();

      first.finish();
      await first.processing;
      vi.advanceTimersByTime(5000);

      expect(heartbeatCalls()).toBe(1);
      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'job-2',
          status: 'PROCESSING',
          processingStartedAt: heartbeatStartedAt,
        },
        data: { heartbeatAt: expect.any(Date) },
      });

      second.finish();
      await second.processing;
    });

    it('swallows update errors gracefully via catch', async () => {
      const { processing, finish } = startProcessing();
      await flushMicrotasks();
      prisma.client.comparisonJob.updateMany.mockRejectedValue(
        new Error('DB error'),
      );

      await vi.advanceTimersByTimeAsync(5000);

      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'queue_heartbeat_failures_total',
        { queue: 'comparison' },
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Heartbeat failed'),
        expect.any(Object),
      );

      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 1 });
      finish();
      await processing;
    });

    it('stops heartbeating a job that was reclaimed by another worker (ownership lost)', async () => {
      const { processing, finish } = startProcessing();
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 0 });

      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(10000);

      expect(heartbeatCalls()).toBe(1);

      finish();
      await processing;
    });
  });

  describe('onModuleDestroy', () => {
    it('clears all timers', async () => {
      const first = startProcessing('job-1');
      await flushMicrotasks();
      const second = startProcessing('job-2');
      await flushMicrotasks();

      queue.onModuleDestroy();

      vi.advanceTimersByTime(10000);

      expect(heartbeatCalls()).toBe(0);

      first.finish();
      await first.processing;
      second.finish();
      await second.processing;
    });

    it('is safe to call when no timers exist', () => {
      expect(() => queue.onModuleDestroy()).not.toThrow();
    });
  });

  describe('markFailed with retry decision', () => {
    it('updates job status to PENDING with incremented attempts on retry', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        { id: 'job-1', status: 'PROCESSING', attempts: 0, maxAttempts: 3 },
      ]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'job-1',
        visualTestId: 'vt-1',
        payload: jobPayload,
        status: 'PROCESSING',
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: null,
      });

      prisma.client.comparisonJob.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 1 });

      const processor = vi.fn().mockRejectedValue(new Error('transient error'));

      await queue.processNext(processor);

      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            attempts: 1,
            nextAttemptAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('permanent failure handling', () => {
    it('fails a job immediately when the processor throws a non-retryable DomainError', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        { id: 'job-1', status: 'PENDING', attempts: 0, maxAttempts: 3 },
      ]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'job-1',
        payload: jobPayload,
        status: 'PROCESSING',
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: null,
      });
      prisma.client.comparisonJob.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 1 });

      const processor = vi
        .fn()
        .mockRejectedValue(
          new DomainError('image dimension mismatch', 'BAD_REQUEST'),
        );

      await queue.processNext(processor);

      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            attempts: 1,
            error: 'image dimension mismatch',
          }),
        }),
      );

      const retryCall = prisma.client.comparisonJob.updateMany.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { data?: { status?: string } })?.data?.status ===
          'PENDING',
      );
      expect(retryCall).toBeUndefined();
    });
  });

  describe('ownership guard', () => {
    it('only completes a job the caller still owns', async () => {
      const startedAt = new Date('2025-01-01T00:00:00Z');
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 0 });

      await queue.markCompleted('job-1', startedAt);

      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'job-1',
          status: 'PROCESSING',
          processingStartedAt: startedAt,
        },
        data: {
          status: 'COMPLETED',
          completedAt: expect.any(Date),
          error: null,
        },
      });
    });

    it('only marks a failed job it still owns', async () => {
      const startedAt = new Date('2025-01-01T00:00:00Z');
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 0 });

      await queue.markFailed('job-1', 'boom', 2, 3, startedAt, false);

      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'job-1',
          status: 'PROCESSING',
          processingStartedAt: startedAt,
        },
        data: expect.objectContaining({
          status: 'FAILED',
          attempts: 3,
        }),
      });
    });
  });

  describe('error state hygiene', () => {
    it('clears a previous error when a job completes', async () => {
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 1 });

      await queue.markCompleted('job-1');

      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', error: null }),
        }),
      );
    });

    it('clears a previous error when a failure is scheduled for retry', async () => {
      prisma.client.comparisonJob.updateMany.mockResolvedValue({ count: 1 });

      await queue.markFailed('job-1', 'new boom', 0, 3);

      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', error: null }),
        }),
      );
    });
  });

  describe('claimNext payload decode failure', () => {
    it('fails a corrupt-payload job immediately without retrying it', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([
        { id: 'job-1', status: 'PENDING', attempts: 0, maxAttempts: 3 },
      ]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'job-1',
        payload: { testKind: 'image' },
        status: 'PROCESSING',
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: null,
      });
      prisma.client.comparisonJob.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 1 });

      const job = await queue.claimNext();

      expect(job).toBeNull();
      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            error: expect.stringContaining('Malformed job data'),
          }),
        }),
      );
    });
  });

  describe('runJob heartbeat lifecycle', () => {
    it('starts and stops heartbeat around successful processing', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([{ id: 'job-1' }]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'job-1',
        visualTestId: 'vt-1',
        payload: jobPayload,
        status: 'PROCESSING',
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: null,
      });
      prisma.client.comparisonJob.updateMany.mockResolvedValue({
        count: 1,
      });

      const processor = vi.fn().mockResolvedValue(undefined);
      await queue.processNext(processor);

      expect(processor).toHaveBeenCalled();
      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('starts and stops heartbeat around failed processing', async () => {
      prisma.client.$queryRawUnsafe.mockResolvedValue([{ id: 'job-1' }]);
      prisma.client.comparisonJob.update.mockResolvedValue({});
      prisma.client.comparisonJob.findUnique.mockResolvedValue({
        id: 'job-1',
        visualTestId: 'vt-1',
        payload: jobPayload,
        status: 'PROCESSING',
        attempts: 0,
        maxAttempts: 1,
        nextAttemptAt: null,
      });
      prisma.client.comparisonJob.updateMany.mockResolvedValue({
        count: 1,
      });

      const processor = vi
        .fn()
        .mockRejectedValue(new DomainError('processor fail', 'INVALID_STATE'));
      await queue.processNext(processor);

      expect(prisma.client.comparisonJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            attempts: 1,
          }),
        }),
      );
    });
  });
});
