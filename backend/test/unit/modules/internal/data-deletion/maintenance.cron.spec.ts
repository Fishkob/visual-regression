import { Test, TestingModule } from '@nestjs/testing';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { MaintenanceCron } from '@internal/data-deletion/cron/maintenance.cron';
import {
  MAINTENANCE_TASKS,
  type MaintenanceTask,
  type MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { PostgresAdvisoryLock } from '@/prisma/postgres-advisory-lock';
import { MetricsService } from '@internal/metrics/metrics.service';
import { METRICS_RECORDER } from '@common/domain/metrics-recorder.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('MaintenanceCron', () => {
  let cron: MaintenanceCron;
  let task1: jest.Mocked<MaintenanceTask>;
  let task2: jest.Mocked<MaintenanceTask>;
  let lock: jest.Mocked<PostgresAdvisoryLock>;
  let metrics: jest.Mocked<MetricsService>;
  let logger: jest.Mocked<AppLoggerService>;

  beforeEach(async () => {
    logger = createMockLogger();
    lock = createMock<PostgresAdvisoryLock>();
    lock.tryLock.mockResolvedValue(true);
    metrics = createMock<MetricsService>();
    task1 = {
      lockId: 1001,
      label: 'task one',
      execute: jest.fn(),
    };
    task2 = {
      lockId: 1002,
      label: 'task two',
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceCron,
        { provide: MAINTENANCE_TASKS, useValue: [task1, task2] },
        { provide: PostgresAdvisoryLock, useValue: lock },
        { provide: METRICS_RECORDER, useValue: metrics },
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    cron = module.get(MaintenanceCron);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should run all registered tasks', async () => {
    task1.execute.mockResolvedValue({});
    task2.execute.mockResolvedValue({});

    await cron.runMaintenance();

    expect(task1.execute).toHaveBeenCalledTimes(1);
    expect(task2.execute).toHaveBeenCalledTimes(1);
  });

  it('should report counters and gauges from task results', async () => {
    const result1: MaintenanceResult = {
      counters: [
        { name: 'task_one_count', value: 5, labels: { type: 'test' } },
      ],
      gauges: [{ name: 'task_one_gauge', value: 3 }],
    };
    task1.execute.mockResolvedValue(result1);
    task2.execute.mockResolvedValue({});

    await cron.runMaintenance();

    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'task_one_count',
      { type: 'test' },
      5,
    );
    expect(metrics.setGauge).toHaveBeenCalledWith('task_one_gauge', 3);
  });

  it('should skip task when lock is not acquired', async () => {
    lock.tryLock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    task2.execute.mockResolvedValue({});

    await cron.runMaintenance();

    expect(task1.execute).not.toHaveBeenCalled();
    expect(task2.execute).toHaveBeenCalledTimes(1);
  });

  it('should continue to next task when one fails', async () => {
    task1.execute.mockRejectedValue(new Error('task one failed'));
    task2.execute.mockResolvedValue({});

    await cron.runMaintenance();

    expect(task1.execute).toHaveBeenCalledTimes(1);
    expect(task2.execute).toHaveBeenCalledTimes(1);
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'maintenance_task_failures_total',
      { task: 'task one' },
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('task one'),
      expect.any(String),
    );
  });

  it('should log start and completion for each task', async () => {
    task1.execute.mockResolvedValue({});
    task2.execute.mockResolvedValue({});

    await cron.runMaintenance();

    expect(logger.log).toHaveBeenCalledWith('Starting task one...');
    expect(logger.log).toHaveBeenCalledWith('task one completed successfully.');
    expect(logger.log).toHaveBeenCalledWith('Starting task two...');
    expect(logger.log).toHaveBeenCalledWith('task two completed successfully.');
  });

  it('should have @Cron metadata set', () => {
    const metadata = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      MaintenanceCron.prototype.runMaintenance,
    );
    expect(metadata).toBeDefined();
    expect(metadata.cronTime).toBeDefined();
  });

  it('should not report metrics when result has none', async () => {
    task1.execute.mockResolvedValue({});
    task2.execute.mockResolvedValue({});

    await cron.runMaintenance();

    expect(metrics.incrementCounter).not.toHaveBeenCalled();
    expect(metrics.setGauge).not.toHaveBeenCalled();
  });
});
