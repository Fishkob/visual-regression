import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HEALTH_CHECK_CACHE_TTL_MS,
  HealthChecker,
} from '@internal/health/health-checker.service';
import { AppConfigService } from '@config/app-config.service';
import { PrismaConnection } from '@/prisma/prisma-connection';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { JOB_QUEUE, IJobQueue } from '@common/domain/job-queue.interface';
import type { HealthCheckResult } from '@common/domain/health-result.type';
import { createMock } from '@test/utils/create-mock';

describe('HealthChecker', () => {
  let checker: HealthChecker;
  let prisma: Mocked<PrismaConnection>;
  let storage: Mocked<IStorageProvider>;
  let jobQueue: Mocked<IJobQueue>;
  let originalFetch: typeof globalThis.fetch;

  const appConfig = {
    appVersion: {
      version: '1.0.0',
      gitCommit: 'abc123',
      buildTime: '2024-01-01T00:00:00Z',
    },
    workerHealth: { url: undefined },
    pdfSidecar: { healthUrl: undefined },
  } as unknown as AppConfigService;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  beforeEach(async () => {
    prisma = createMock<PrismaConnection>();
    storage = createMock<IStorageProvider>();
    jobQueue = createMock<IJobQueue>();
    prisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);
    storage.healthCheck.mockResolvedValue(undefined);
    jobQueue.healthCheck.mockResolvedValue({
      pending: 10,
      processing: 2,
      failed: 5,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthChecker,
        { provide: PrismaConnection, useValue: prisma },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: JOB_QUEUE, useValue: jobQueue },
        { provide: AppConfigService, useValue: appConfig },
      ],
    }).compile();

    checker = module.get(HealthChecker);
  });

  describe('checkAll', () => {
    it('returns ok when all checks pass', async () => {
      const result = await checker.checkAll();

      expect(result.checks.database).toEqual(
        expect.objectContaining({ status: 'ok' }),
      );
      expect(result.checks.storage).toEqual(
        expect.objectContaining({ status: 'ok' }),
      );
      expect(result.checks.queues).toEqual(
        expect.objectContaining({ status: 'ok' }),
      );
      expect(result.checks.worker).toEqual(
        expect.objectContaining({ status: 'skipped' }),
      );
      expect(result.checks['pdf-sidecar']).toEqual(
        expect.objectContaining({ status: 'skipped' }),
      );
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('collects errors from failed checks', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      storage.healthCheck.mockRejectedValue(new Error('Storage down'));

      const result = await checker.checkAll();

      expect(result.errors).toEqual(['database', 'storage']);
      expect(result.warnings).toEqual([]);
    });

    it('collects warnings from degraded checks', async () => {
      jobQueue.healthCheck.mockResolvedValue({
        pending: 10,
        processing: 5,
        failed: 101,
      });

      const result = await checker.checkAll();

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual(['queues']);
    });

    it('collects both errors and warnings', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('DB down'));
      storage.healthCheck.mockRejectedValue(new Error('Storage slow'));
      jobQueue.healthCheck.mockResolvedValue({
        pending: 10,
        processing: 5,
        failed: 200,
      });

      const result = await checker.checkAll();

      expect(result.errors).toEqual(['database', 'storage']);
      expect(result.warnings).toEqual(['queues']);
    });

    it('does not let a throwing check fail the whole check', async () => {
      jobQueue.healthCheck.mockRejectedValue(new Error('probe crashed'));

      const result = await checker.checkAll();

      expect(result.checks.queues).toEqual({
        status: 'error',
        latencyMs: expect.any(Number),
        message: 'Queue check failed',
        details: { error: 'probe crashed' },
      });
      expect(result.errors).toEqual(['queues']);
      expect(result.checks.database).toEqual(
        expect.objectContaining({ status: 'ok' }),
      );
    });
  });

  describe('checkAll caching', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('serves two immediate calls from a single probe fan-out', async () => {
      const first = await checker.checkAll();
      const second = await checker.checkAll();

      expect(second).toBe(first);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(storage.healthCheck).toHaveBeenCalledTimes(1);
      expect(jobQueue.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates concurrent calls that are still in flight', async () => {
      const [first, second] = await Promise.all([
        checker.checkAll(),
        checker.checkAll(),
      ]);

      expect(second).toBe(first);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('runs the probes again once the cache TTL has elapsed', async () => {
      vi.useFakeTimers();

      await checker.checkAll();
      vi.advanceTimersByTime(HEALTH_CHECK_CACHE_TTL_MS + 1);
      await checker.checkAll();

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('runs the probes again after resetCache', async () => {
      await checker.checkAll();
      checker.resetCache();
      await checker.checkAll();

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('getBuildInfoData', () => {
    it('returns the build info from app config plus the running node version', () => {
      const result = checker.getBuildInfoData();

      expect(result).toEqual({
        version: '1.0.0',
        commitHash: 'abc123',
        buildTime: '2024-01-01T00:00:00Z',
        nodeVersion: process.version,
      });
    });
  });

  describe('calculateStatus', () => {
    it('reports unhealthy whenever there are errors, regardless of warnings', () => {
      expect(checker.calculateStatus(['database'], [])).toBe('unhealthy');
      expect(checker.calculateStatus(['database'], ['queues'])).toBe(
        'unhealthy',
      );
    });

    it('reports degraded for warnings only', () => {
      expect(checker.calculateStatus([], ['queues'])).toBe('degraded');
    });

    it('reports ok when there are no errors or warnings', () => {
      expect(checker.calculateStatus([], [])).toBe('ok');
    });
  });

  describe('buildResponse', () => {
    const checks: Record<string, HealthCheckResult> = {
      database: { status: 'ok', latencyMs: 2 },
      queues: { status: 'degraded', latencyMs: 5 },
    };

    it('aggregates a degraded status with a results map of each check status', () => {
      const response = checker.buildResponse(checks, [], ['queues']);

      expect(response.status).toBe('degraded');
      expect(response.results).toEqual({
        database: 'ok',
        queues: 'degraded',
      });
      expect(response.warnings).toEqual(['queues']);
      expect(response.errors).toBeUndefined();
    });

    it('reports unhealthy and includes errors when any check failed', () => {
      const response = checker.buildResponse(
        { ...checks, storage: { status: 'error' } },
        ['storage'],
        [],
      );

      expect(response.status).toBe('unhealthy');
      expect(response.errors).toEqual(['storage']);
      expect(response.warnings).toBeUndefined();
    });

    it('reports ok and omits both error and warning arrays when healthy', () => {
      const response = checker.buildResponse(
        { database: { status: 'ok', latencyMs: 2 } },
        [],
        [],
      );

      expect(response.status).toBe('ok');
      expect(response.warnings).toBeUndefined();
      expect(response.errors).toBeUndefined();
    });

    it('includes version, build info, uptime and raw checks', () => {
      const response = checker.buildResponse(checks, [], []);

      expect(response.timestamp).toEqual(expect.any(String));
      expect(response.version).toBe('1.0.0');
      expect(response.buildInfo).toEqual({
        version: '1.0.0',
        commitHash: 'abc123',
        buildTime: '2024-01-01T00:00:00Z',
        nodeVersion: process.version,
      });
      expect(response.uptime).toBeGreaterThanOrEqual(0);
      expect(response.checks).toEqual(checks);
    });
  });

  describe('runCheck', () => {
    it('returns database check result when found', async () => {
      const result = await checker.runCheck('database');

      expect(result).toEqual(expect.objectContaining({ status: 'ok' }));
    });

    it('returns skipped when check name not found', async () => {
      const result = await checker.runCheck('nonexistent');

      expect(result).toEqual({
        status: 'skipped',
        message: 'Health check "nonexistent" not configured',
      });
    });

    it('returns error when database check returns error', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const result = await checker.runCheck('database');

      expect(result.status).toBe('error');
      expect(result.message).toBe('Connection refused');
    });

    it('returns ok for storage check', async () => {
      const result = await checker.runCheck('storage');

      expect(result).toEqual(expect.objectContaining({ status: 'ok' }));
    });

    it('returns ok for queue check', async () => {
      const result = await checker.runCheck('queues');

      expect(result).toEqual(expect.objectContaining({ status: 'ok' }));
    });
  });

  describe('queue details', () => {
    it('returns details when queue check passes', async () => {
      const result = (await checker.checkAll()).checks
        .queues as HealthCheckResult;

      expect(result.details).toEqual({
        pending: 10,
        processing: 2,
        failed: 5,
      });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns degraded with message when failed jobs > 100', async () => {
      jobQueue.healthCheck.mockResolvedValue({
        pending: 50,
        processing: 3,
        failed: 150,
      });

      const result = (await checker.runCheck('queues')) as HealthCheckResult;

      expect(result.status).toBe('degraded');
      expect(result.message).toBe('High number of failed jobs: 150');
      expect(result.details).toEqual({
        pending: 50,
        processing: 3,
        failed: 150,
      });
    });
  });

  describe('worker check', () => {
    it('returns ok when worker responds with ok', async () => {
      (appConfig as { workerHealth: { url?: string } }).workerHealth.url =
        'http://worker:3002/health';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            uptime: 3600,
            lastJobProcessedAt: '2024-01-01T00:00:00Z',
            lastPollAt: '2024-01-01T00:00:00Z',
            jobsProcessed: 42,
          }),
      }) as unknown as typeof fetch;

      const result = await checker.runCheck('worker');

      expect(result.status).toBe('ok');
      expect(result.details).toEqual({
        uptime: 3600,
        lastJobProcessedAt: '2024-01-01T00:00:00Z',
        lastPollAt: '2024-01-01T00:00:00Z',
        jobsProcessed: 42,
      });
    });

    it('returns error when worker returns non-ok HTTP status', async () => {
      (appConfig as { workerHealth: { url?: string } }).workerHealth.url =
        'http://worker:3002/health';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }) as unknown as typeof fetch;

      const result = await checker.runCheck('worker');

      expect(result.status).toBe('error');
      expect(result.message).toBe('Worker returned 503');
    });

    it('returns error when fetch throws', async () => {
      (appConfig as { workerHealth: { url?: string } }).workerHealth.url =
        'http://worker:3002/health';
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(
          new Error('Worker unreachable'),
        ) as unknown as typeof fetch;

      const result = await checker.runCheck('worker');

      expect(result.status).toBe('error');
      expect(result.message).toBe('Worker health check failed');
      expect(result.details).toEqual({ error: 'Worker unreachable' });
    });
  });

  describe('pdf-sidecar check', () => {
    it('returns ok when sidecar responds with UP', async () => {
      (
        appConfig as { pdfSidecar: { healthUrl?: string } }
      ).pdfSidecar.healthUrl = 'http://sidecar:3001/health';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'UP' }),
      }) as unknown as typeof fetch;

      const result = await checker.runCheck('pdf-sidecar');

      expect(result.status).toBe('ok');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error when sidecar responds with non-UP status', async () => {
      (
        appConfig as { pdfSidecar: { healthUrl?: string } }
      ).pdfSidecar.healthUrl = 'http://sidecar:3001/health';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'DOWN' }),
      }) as unknown as typeof fetch;

      const result = await checker.runCheck('pdf-sidecar');

      expect(result.status).toBe('error');
      expect(result.message).toBe(
        'PDF sidecar health check returned status "DOWN"',
      );
    });

    it('returns error when fetch throws', async () => {
      (
        appConfig as { pdfSidecar: { healthUrl?: string } }
      ).pdfSidecar.healthUrl = 'http://sidecar:3001/health';
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(
          new Error('Connection timeout'),
        ) as unknown as typeof fetch;

      const result = await checker.runCheck('pdf-sidecar');

      expect(result.status).toBe('error');
      expect(result.message).toBe('PDF sidecar health check failed');
      expect(result.details).toEqual({ error: 'Connection timeout' });
    });
  });
});
