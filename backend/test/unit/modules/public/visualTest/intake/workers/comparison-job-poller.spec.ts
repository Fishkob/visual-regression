import { Test, TestingModule } from '@nestjs/testing';
import { ComparisonJobPoller } from '@public/visualTest/intake/workers/comparison-job-poller';
import { JOB_QUEUE, IJobQueue } from '@common/domain/job-queue.interface';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import {
  WORKER_HEALTH,
  IWorkerHealth,
} from '@common/domain/worker-health.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMockLogger } from '@test/utils/mocks';
import { createMock } from '@test/utils/create-mock';
import type { JobData } from '@common/domain/job-data.types';

const jobPayload: JobData = {
  testKind: 'image',
  testId: 'test-1',
  candidateHash: 'hash-from-upload',
  candidate: { id: 'candidate-1', url: 'http://storage/candidate.png' },
  baseline: { id: 'b', url: 'http://storage/baseline.png' },
  variant: { viewport: 'v', browser: 'c', environment: 'e' },
};

function makeMockJob(
  overrides: Partial<{
    id: string;
    testId: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'job-1',
    testId: overrides.testId ?? 'test-1',
    payload: jobPayload,
    status: 'PENDING' as const,
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: null,
  };
}

describe('ComparisonJobPoller', () => {
  let poller: ComparisonJobPoller;
  let queue: jest.Mocked<IJobQueue>;
  let processor: jest.Mocked<ComparisonJobProcessor>;
  let healthServer: jest.Mocked<IWorkerHealth>;
  let logger: jest.Mocked<AppLoggerService>;
  let capturedTimeouts: Array<{ cb: () => void; ms: number }>;
  let capturedIntervals: Array<{ cb: () => void; ms: number }>;

  async function triggerLatestPoll(): Promise<void> {
    const timer = capturedTimeouts[capturedTimeouts.length - 1];
    timer.cb();
    await (poller as any).inFlight;
  }

  beforeEach(async () => {
    capturedTimeouts = [];
    capturedIntervals = [];
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
      cb: () => void,
      ms: number,
    ) => {
      capturedTimeouts.push({ cb, ms });
      return capturedTimeouts.length;
    }) as typeof globalThis.setTimeout);
    jest.spyOn(globalThis, 'clearTimeout').mockImplementation(jest.fn());
    jest.spyOn(globalThis, 'setInterval').mockImplementation(((
      cb: () => void,
      ms: number,
    ) => {
      capturedIntervals.push({ cb, ms });
      return capturedIntervals.length;
    }) as typeof globalThis.setInterval);
    jest.spyOn(globalThis, 'clearInterval').mockImplementation(jest.fn());

    queue = createMock<IJobQueue>();
    processor = createMock<ComparisonJobProcessor>();
    healthServer = createMock<IWorkerHealth>();
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparisonJobPoller,
        { provide: JOB_QUEUE, useValue: queue },
        { provide: ComparisonJobProcessor, useValue: processor },
        { provide: WORKER_HEALTH, useValue: healthServer },
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    poller = module.get(ComparisonJobPoller);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onApplicationBootstrap', () => {
    it('logs start and schedules first poll', () => {
      poller.onApplicationBootstrap();

      expect(logger.log).toHaveBeenCalledWith('ComparisonJobPoller started');
      expect(capturedTimeouts).toHaveLength(1);
      expect(capturedTimeouts[0].ms).toBe(2000);
    });

    it('does not process a job immediately, only after interval', () => {
      poller.onApplicationBootstrap();

      expect(queue.processNext).not.toHaveBeenCalled();
    });
  });

  describe('poll cycle', () => {
    beforeEach(() => {
      poller.onApplicationBootstrap();
    });

    it('processes a job and resets interval to minimum', async () => {
      queue.processNext.mockImplementation(async (jobProcessor) => {
        await jobProcessor(makeMockJob());
        return true;
      });

      await triggerLatestPoll();

      expect(processor.processJob).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'job-1' }),
      );
      expect(capturedTimeouts).toHaveLength(2);
      expect(capturedTimeouts[1].ms).toBe(2000);
    });

    it('records a processed job on the worker health server', async () => {
      queue.processNext.mockImplementation(async (jobProcessor) => {
        await jobProcessor(makeMockJob());
        return true;
      });

      await triggerLatestPoll();

      expect(healthServer.recordJobProcessed).toHaveBeenCalled();
      expect(healthServer.recordPoll).toHaveBeenCalled();
    });

    it('does not record a processed job when queue is empty', async () => {
      queue.processNext.mockResolvedValue(false);

      await triggerLatestPoll();

      expect(healthServer.recordJobProcessed).not.toHaveBeenCalled();
    });

    it('records a poll on every cycle even when the queue is empty', async () => {
      queue.processNext.mockResolvedValue(false);

      await triggerLatestPoll();
      await triggerLatestPoll();

      expect(healthServer.recordPoll).toHaveBeenCalledTimes(2);
      expect(healthServer.recordJobProcessed).not.toHaveBeenCalled();
    });

    it('refreshes poll liveness while a job is in flight', async () => {
      let releaseJob!: () => void;
      queue.processNext.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            releaseJob = () => resolve(true);
          }),
      );

      poller.onApplicationBootstrap();
      const pollTimer = capturedTimeouts[capturedTimeouts.length - 1];
      pollTimer.cb();
      await Promise.resolve();

      expect(capturedIntervals).toHaveLength(1);
      expect(capturedIntervals[0].ms).toBeLessThan(150_000);

      capturedIntervals[0].cb();
      expect(healthServer.recordPoll).toHaveBeenCalledTimes(2);

      releaseJob();
      await (poller as any).inFlight;
      expect(clearInterval).toHaveBeenCalledWith(1);
    });

    it('doubles poll interval when queue is empty, capped at max', async () => {
      queue.processNext.mockResolvedValue(false);

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(2);
      expect(capturedTimeouts[1].ms).toBe(4000);

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(3);
      expect(capturedTimeouts[2].ms).toBe(8000);

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(4);
      expect(capturedTimeouts[3].ms).toBe(16000);

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(5);
      expect(capturedTimeouts[4].ms).toBe(30000);

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(6);
      expect(capturedTimeouts[5].ms).toBe(30000);
    });

    it('resets interval to minimum when job is found after empty polls', async () => {
      queue.processNext
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockImplementationOnce(async (jobProcessor) => {
          await jobProcessor(makeMockJob({ id: 'job-3' }));
          return true;
        });

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(2);
      expect(capturedTimeouts[1].ms).toBe(4000);

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(3);
      expect(capturedTimeouts[2].ms).toBe(8000);

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(4);
      expect(capturedTimeouts[3].ms).toBe(2000);
    });

    it('logs error when poll cycle throws', async () => {
      const error = new Error('DB connection lost');
      queue.processNext.mockRejectedValue(error);

      await triggerLatestPoll();

      expect(logger.error).toHaveBeenCalledWith(
        'Poll cycle failed',
        error.stack,
      );
      expect(capturedTimeouts).toHaveLength(2);
    });

    it('does not schedule next poll when shutting down', async () => {
      queue.processNext.mockResolvedValue(false);

      await triggerLatestPoll();
      expect(capturedTimeouts).toHaveLength(2);

      await poller.onModuleDestroy();

      await triggerLatestPoll();

      expect(capturedTimeouts).toHaveLength(2);
    });
  });

  describe('onModuleDestroy', () => {
    it('clears the poll timer and drains pending jobs', async () => {
      queue.processNext
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      poller.onApplicationBootstrap();
      await triggerLatestPoll();
      await poller.onModuleDestroy();

      expect(clearTimeout).toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        'Worker drained 1 jobs before shutdown',
      );
    });

    it('does not log drain message when no pending jobs', async () => {
      queue.processNext.mockResolvedValue(false);

      await poller.onModuleDestroy();

      expect(logger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('drained'),
      );
    });

    it('handles errors during drain without crashing', async () => {
      queue.processNext
        .mockRejectedValueOnce(new Error('drain error'))
        .mockResolvedValueOnce(false);

      await poller.onModuleDestroy();

      expect(logger.error).toHaveBeenCalledWith(
        'Drain cycle failed',
        expect.any(String),
      );
    });
  });
});
