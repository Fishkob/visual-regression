import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '@internal/health/health.controller';
import { HealthChecker } from '@internal/health/health-checker.service';
import type {
  BuildInfo,
  DetailedHealthDto,
  HealthCheckResult,
} from '@internal/health/health.types';
import { createMock } from '@test/utils/create-mock';

function mockRes(): { status: jest.Mock } {
  return { status: jest.fn().mockReturnThis() };
}

describe('HealthController', () => {
  let controller: HealthController;
  let checker: jest.Mocked<HealthChecker>;

  const buildInfo: BuildInfo = {
    version: '1.0.0',
    commitHash: 'abc123',
    buildTime: '2024-01-01T00:00:00.000Z',
    nodeVersion: 'v20.0.0',
  };

  beforeEach(async () => {
    checker = createMock<HealthChecker>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthChecker, useValue: checker }],
    }).compile();

    controller = module.get(HealthController);
  });

  describe('liveness', () => {
    it('returns ok status with build info', () => {
      checker.getBuildInfoData.mockReturnValue(buildInfo);

      const result = controller.liveness();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        buildInfo,
      });
    });
  });

  describe('check', () => {
    it('returns healthy response when all systems pass', async () => {
      const checks: Record<string, HealthCheckResult> = {
        database: { status: 'ok' },
        storage: { status: 'ok' },
        queues: { status: 'ok' },
      };
      const response = {
        status: 'ok',
        results: { database: 'ok', storage: 'ok', queues: 'ok' },
        timestamp: '2024-01-01T00:00:00.000Z',
        version: '1.0.0',
        buildInfo,
        uptime: 100,
        checks,
      } as DetailedHealthDto;

      checker.checkAll.mockResolvedValue({
        checks,
        errors: [],
        warnings: [],
      });
      checker.buildResponse.mockReturnValue(response);

      const res = mockRes();
      const result = await controller.check(res as any);

      expect(result).toBe(response);
    });

    it('sets SERVICE_UNAVAILABLE and returns the DTO when unhealthy', async () => {
      const checks: Record<string, HealthCheckResult> = {
        database: { status: 'error', message: 'Connection failed' },
        storage: { status: 'ok' },
        queues: { status: 'ok' },
      };
      const response = {
        status: 'unhealthy',
        results: { database: 'error', storage: 'ok', queues: 'ok' },
        timestamp: '2024-01-01T00:00:00.000Z',
        version: '1.0.0',
        buildInfo,
        uptime: 100,
        checks,
      } as DetailedHealthDto;

      checker.checkAll.mockResolvedValue({
        checks,
        errors: ['database'],
        warnings: [],
      });
      checker.buildResponse.mockReturnValue(response);

      const res = mockRes();
      const result = await controller.check(res as any);

      expect(result).toBe(response);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe('readiness', () => {
    it('returns healthy response when all systems pass', async () => {
      const checks: Record<string, HealthCheckResult> = {
        database: { status: 'ok' },
        storage: { status: 'ok' },
        queues: { status: 'ok' },
      };
      const response = {
        status: 'ok',
        results: { database: 'ok', storage: 'ok', queues: 'ok' },
        timestamp: '2024-01-01T00:00:00.000Z',
        version: '1.0.0',
        buildInfo,
        uptime: 100,
        checks,
      } as DetailedHealthDto;

      checker.checkAll.mockResolvedValue({
        checks,
        errors: [],
        warnings: [],
      });
      checker.buildResponse.mockReturnValue(response);

      const res = mockRes();
      const result = await controller.readiness(res as any);

      expect(result).toBe(response);
    });

    it('sets SERVICE_UNAVAILABLE and returns the DTO when unhealthy', async () => {
      const checks: Record<string, HealthCheckResult> = {
        database: { status: 'error', message: 'Connection failed' },
        storage: { status: 'ok' },
        queues: { status: 'ok' },
      };
      const response = {
        status: 'unhealthy',
        results: { database: 'error', storage: 'ok', queues: 'ok' },
        timestamp: '2024-01-01T00:00:00.000Z',
        version: '1.0.0',
        buildInfo,
        uptime: 100,
        checks,
      } as DetailedHealthDto;

      checker.checkAll.mockResolvedValue({
        checks,
        errors: ['database'],
        warnings: [],
      });
      checker.buildResponse.mockReturnValue(response);

      const res = mockRes();
      const result = await controller.readiness(res as any);

      expect(result).toBe(response);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe('checkDatabase', () => {
    it('returns database check result', async () => {
      const dbResult: HealthCheckResult = { status: 'ok' };
      checker.runCheck.mockResolvedValue(dbResult);

      const res = mockRes();
      const result = await controller.checkDatabase(res as any);

      expect(result).toBe(dbResult);
      expect(checker.runCheck).toHaveBeenCalledWith('database');
    });

    it('sets SERVICE_UNAVAILABLE when the database check fails', async () => {
      checker.runCheck.mockResolvedValue({
        status: 'error',
        message: 'Connection refused',
      });

      const res = mockRes();
      const result = await controller.checkDatabase(res as any);

      expect(result).toEqual({
        status: 'error',
        message: 'Connection refused',
      });
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe('checkStorage', () => {
    it('returns storage check result', async () => {
      const storageResult: HealthCheckResult = { status: 'ok' };
      checker.runCheck.mockResolvedValue(storageResult);

      const res = mockRes();
      const result = await controller.checkStorage(res as any);

      expect(result).toBe(storageResult);
      expect(checker.runCheck).toHaveBeenCalledWith('storage');
    });

    it('sets SERVICE_UNAVAILABLE when the storage check fails', async () => {
      checker.runCheck.mockResolvedValue({
        status: 'error',
        message: 'bucket missing',
      });

      const res = mockRes();
      const result = await controller.checkStorage(res as any);

      expect(result).toEqual({ status: 'error', message: 'bucket missing' });
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });
});
