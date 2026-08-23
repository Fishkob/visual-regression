import { Test, TestingModule } from '@nestjs/testing';
import { FailedJobCleanupTask } from '@internal/data-deletion/tasks/failed-job-cleanup.task';
import {
  FAILED_JOB_STORE,
  IFailedJobStore,
} from '@common/domain/job-queue.interface';
import {
  STORAGE_OBJECT_REFERENCEDNESS,
  IStorageObjectReferencedness,
} from '@common/domain/storage-referencedness.interface';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AppConfigService } from '@config/app-config.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('FailedJobCleanupTask', () => {
  let task: FailedJobCleanupTask;
  let failedJobs: jest.Mocked<IFailedJobStore>;
  let storage: jest.Mocked<IStorageProvider>;
  let referencedness: jest.Mocked<IStorageObjectReferencedness>;
  let logger: jest.Mocked<AppLoggerService>;

  const defaultConfig = { jobRetention: { days: 7 } };

  function createModule(config: Record<string, unknown> = defaultConfig) {
    return Test.createTestingModule({
      providers: [
        FailedJobCleanupTask,
        { provide: FAILED_JOB_STORE, useValue: failedJobs },
        { provide: STORAGE_OBJECT_REFERENCEDNESS, useValue: referencedness },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: AppLoggerService, useValue: logger },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();
  }

  beforeEach(async () => {
    failedJobs = createMock<IFailedJobStore>();
    failedJobs.findFailedJobs.mockResolvedValue([]);
    failedJobs.deleteFailedJobRows.mockResolvedValue([]);
    failedJobs.deleteCompletedJobs.mockResolvedValue(0);
    storage = createMock<IStorageProvider>();
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });
    referencedness = createMock<IStorageObjectReferencedness>();
    referencedness.filterReclaimableUrls.mockImplementation((urls) =>
      Promise.resolve(urls),
    );
    logger = createMockLogger();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should have lockId and label set', async () => {
    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);
    expect(task.lockId).toBe(1002);
    expect(task.label).toBe('failed job cleanup');
  });

  it('should delete failed and completed jobs and return gauges', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-1',
        testId: 'test-1',
        candidateId: 'c-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidate: { id: 'c-1', url: 'http://storage/candidate.png' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);
    failedJobs.deleteCompletedJobs.mockResolvedValue(3);
    failedJobs.deleteFailedJobRows.mockResolvedValue(['job-1']);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    const result = await task.execute();

    expect(failedJobs.findFailedJobs).toHaveBeenCalledWith(7);
    expect(failedJobs.deleteCompletedJobs).toHaveBeenCalledWith(7);
    expect(failedJobs.deleteFailedJobRows).toHaveBeenCalledWith(['job-1']);
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'http://storage/candidate.png',
    ]);
    expect(result.gauges).toEqual([
      { name: 'cleanup_failed_jobs_deleted', value: 1 },
      { name: 'cleanup_completed_jobs_deleted', value: 3 },
    ]);
  });
  it('should not touch storage when no failed jobs were found', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([]);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(failedJobs.deleteFailedJobRows).not.toHaveBeenCalled();
  });

  it('should use custom retention days from config', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-1',
        testId: 'test-1',
        payload: {
          testKind: 'pdf',
          testId: 'test-1',
          candidate: { id: 'c-1', url: 'http://storage/candidate.pdf' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);

    const module: TestingModule = await createModule({
      jobRetention: { days: 14 },
    });
    task = module.get(FailedJobCleanupTask);
    failedJobs.deleteFailedJobRows.mockResolvedValue(['job-1']);

    await task.execute();

    expect(failedJobs.findFailedJobs).toHaveBeenCalledWith(14);
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'http://storage/candidate.pdf',
    ]);
  });

  it('reports zero gauges when nothing was deleted', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([]);
    failedJobs.deleteCompletedJobs.mockResolvedValue(0);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    const result = await task.execute();

    expect(result.gauges).toEqual([
      { name: 'cleanup_failed_jobs_deleted', value: 0 },
      { name: 'cleanup_completed_jobs_deleted', value: 0 },
    ]);
  });

  it('logs candidate objects whose storage deletion failed', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-1',
        testId: 'test-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidate: { url: 'http://storage/candidate.png' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);
    storage.deleteAll.mockResolvedValue({
      deleted: [],
      failed: [{ url: 'http://storage/candidate.png', error: 'rustfs down' }],
    });
    failedJobs.deleteFailedJobRows.mockResolvedValue(['job-1']);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    const result = await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([
      'http://storage/candidate.png',
    ]);
    expect(failedJobs.deleteFailedJobRows).toHaveBeenCalledWith(['job-1']);
    expect(result.gauges).toEqual([
      { name: 'cleanup_failed_jobs_deleted', value: 1 },
      { name: 'cleanup_completed_jobs_deleted', value: 0 },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('http://storage/candidate.png'),
    );
  });

  it('deletes storage files before job rows (storage-first ordering)', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-1',
        testId: 'test-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidate: { url: 'http://storage/candidate.png' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);
    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    const storageOrder: string[] = [];
    storage.deleteAll.mockImplementation(async () => {
      storageOrder.push('storage');
      return { deleted: [], failed: [] };
    });
    failedJobs.deleteFailedJobRows.mockImplementation(async () => {
      storageOrder.push('db');
      return ['job-1'];
    });

    await task.execute();

    expect(storageOrder).toEqual(['db', 'storage']);
  });

  it('keeps the candidate file of a job rescued by a DLQ retry during the sweep', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-1',
        testId: 'test-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidate: { url: 'http://storage/candidate.png' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);
    failedJobs.deleteFailedJobRows.mockResolvedValue([]);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    await task.execute();

    expect(failedJobs.deleteFailedJobRows).toHaveBeenCalledWith(['job-1']);
    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('deletes the job row even when the candidate storage delete failed', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-1',
        testId: 'test-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidate: { url: 'http://storage/candidate.png' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);
    storage.deleteAll.mockResolvedValue({
      deleted: [],
      failed: [{ url: 'http://storage/candidate.png', error: 'rustfs down' }],
    });
    failedJobs.deleteFailedJobRows.mockResolvedValue(['job-1']);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    await task.execute();

    expect(failedJobs.deleteFailedJobRows).toHaveBeenCalledWith(['job-1']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('http://storage/candidate.png'),
    );
  });

  it('leaves the candidate object of a decode-failed job for orphan cleanup', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-broken',
        testId: 'test-1',
        candidateId: 'c-1',
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(failedJobs.deleteFailedJobRows).toHaveBeenCalledWith(['job-broken']);
  });

  it('deletes the job row of a decode-failed job whose candidate row is gone', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-broken',
        testId: 'test-1',
        candidateId: 'c-gone',
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(failedJobs.deleteFailedJobRows).toHaveBeenCalledWith(['job-broken']);
  });

  it('keeps the storage object but deletes the row when the candidate url is now a baseline', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-1',
        testId: 'test-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidate: { url: 'http://storage/candidate.png' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);
    referencedness.filterReclaimableUrls.mockResolvedValue([]);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    await task.execute();

    expect(referencedness.filterReclaimableUrls).toHaveBeenCalledWith([
      'http://storage/candidate.png',
    ]);
    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(failedJobs.deleteFailedJobRows).toHaveBeenCalledWith(['job-1']);
  });

  it('deletes only non-baseline candidate objects when some are still referenced as baselines', async () => {
    failedJobs.findFailedJobs.mockResolvedValue([
      {
        id: 'job-1',
        testId: 'test-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidate: { url: 'http://storage/shared.png' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
      {
        id: 'job-2',
        testId: 'test-1',
        payload: {
          testKind: 'image',
          testId: 'test-1',
          candidate: { url: 'http://storage/orphan.png' },
        } as never,
        error: 'boom',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date(),
      },
    ]);
    referencedness.filterReclaimableUrls.mockImplementation((urls) =>
      Promise.resolve(
        urls.filter((url) => url !== 'http://storage/shared.png'),
      ),
    );
    failedJobs.deleteFailedJobRows.mockResolvedValue(['job-1', 'job-2']);

    const module: TestingModule = await createModule();
    task = module.get(FailedJobCleanupTask);

    await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([
      'http://storage/orphan.png',
    ]);
    expect(failedJobs.deleteFailedJobRows).toHaveBeenCalledWith([
      'job-1',
      'job-2',
    ]);
  });
});
