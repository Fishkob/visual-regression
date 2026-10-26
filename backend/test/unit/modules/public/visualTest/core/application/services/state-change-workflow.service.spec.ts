import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  STORAGE_OBJECT_REFERENCEDNESS,
  IStorageObjectReferencedness,
} from '@common/domain/storage-referencedness.interface';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import { DomainError } from '@common/domain/domain-error';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { createMock } from '@test/utils/create-mock';
import { createMockUoW, createMockLogger } from '@test/utils/mocks';
import type { ObservabilityEvent } from '@common/domain/observability-event.type';
import { Prisma } from '@/prisma/client';
import { AppLoggerService } from '@common/logging/app-logger.service';
import type { PersistedChange } from '@public/visualTest/core/application/services/state-change-options';

function screenshotEvent(): ObservabilityEvent {
  return {
    kind: 'screenshot_uploaded',
    visualTestId: 'test-1',
    type: 'BASELINE',
  };
}

function change(
  overrides: Partial<PersistedChange & { kind: 'change' }> = {},
): PersistedChange {
  return { kind: 'change', affectedTestIds: ['test-1'], ...overrides };
}

function noop(
  overrides: Partial<PersistedChange & { kind: 'noop' }> = {},
): PersistedChange {
  return { kind: 'noop', ...overrides };
}

function deleted(
  overrides: Partial<PersistedChange & { kind: 'deleted' }> = {},
): PersistedChange {
  return { kind: 'deleted', ...overrides };
}

describe('StateChangeWorkflow', () => {
  let workflow: StateChangeWorkflow;
  let storageUsage: Mocked<StorageUsageService>;
  let uow: Mocked<PrismaUnitOfWork>;
  let storage: Mocked<IStorageProvider>;
  let statusService: Mocked<TestStatusService>;
  let logger: Mocked<AppLoggerService>;
  let metrics: Mocked<IMetricsRecorder>;
  let referencedness: Mocked<IStorageObjectReferencedness>;

  beforeEach(async () => {
    uow = createMockUoW() as unknown as Mocked<PrismaUnitOfWork>;
    storage = createMock<IStorageProvider>();
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });
    storage.deleteQuietly.mockResolvedValue(undefined);
    storageUsage = createMock<StorageUsageService>();
    storageUsage.assertWithinQuota.mockResolvedValue(undefined);
    statusService = createMock<TestStatusService>();
    statusService.recomputeStatus.mockResolvedValue(undefined);
    logger = createMockLogger();
    metrics = createMock<IMetricsRecorder>();
    referencedness = createMock<IStorageObjectReferencedness>();
    referencedness.filterReclaimableUrls.mockImplementation((urls: string[]) =>
      Promise.resolve(urls),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StateChangeWorkflow,
        { provide: PrismaUnitOfWork, useValue: uow },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: TestStatusService, useValue: statusService },
        { provide: StorageUsageService, useValue: storageUsage },
        { provide: AppLoggerService, useValue: logger },
        { provide: METRICS_RECORDER, useValue: metrics },
        { provide: STORAGE_OBJECT_REFERENCEDNESS, useValue: referencedness },
      ],
    }).compile();

    workflow = module.get(StateChangeWorkflow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits observability for the events returned by the change after commit', async () => {
    await workflow.executeStateChange(() =>
      Promise.resolve(change({ events: [screenshotEvent()] })),
    );

    expect(logger.log).toHaveBeenCalledWith('Screenshot uploaded', {
      visualTestId: 'test-1',
      type: 'BASELINE',
    });
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'domain_events_total',
      {
        event: 'screenshot_uploaded',
        type: 'BASELINE',
        status: '',
      },
    );
  });

  it('emits observability before running the handler cleanup after commit', async () => {
    const order: string[] = [];
    const cleanup = vi.fn().mockImplementation(async () => {
      order.push('cleanup');
    });
    logger.log.mockImplementation(() => {
      order.push('log');
    });

    await workflow.executeStateChange(
      () => Promise.resolve(change({ events: [screenshotEvent()] })),
      { onSuccess: cleanup },
    );

    expect(order).toEqual(['log', 'cleanup']);
  });

  it('emits observability before deleting stale files after commit', async () => {
    const order: string[] = [];
    logger.log.mockImplementation(() => {
      order.push('log');
    });
    storage.deleteAll.mockImplementation(async () => {
      order.push('deleteAll');
      return { deleted: [], failed: [] };
    });

    await workflow.executeStateChange(() =>
      Promise.resolve(
        change({
          events: [screenshotEvent()],
          staleUrls: ['https://storage/stale.png'],
        }),
      ),
    );

    expect(order).toEqual(['log', 'deleteAll']);
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'https://storage/stale.png',
    ]);
  });

  it('runs the onSuccess cleanup before deleting stale files (eviction sees its source)', async () => {
    const order: string[] = [];
    storage.deleteAll.mockImplementation(async () => {
      order.push('deleteAll');
      return { deleted: [], failed: [] };
    });
    const cleanup = vi.fn().mockImplementation(async () => {
      order.push('cleanup');
    });

    await workflow.executeStateChange(
      () =>
        Promise.resolve(change({ staleUrls: ['https://storage/stale.png'] })),
      { onSuccess: cleanup },
    );

    expect(order).toEqual(['cleanup', 'deleteAll']);
  });

  it('recomputes statuses for the affected testIds on the result', async () => {
    await workflow.executeStateChange(() =>
      Promise.resolve(change({ affectedTestIds: ['test-1', 'test-2'] })),
    );

    expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
    expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-2');
  });

  it('does not recompute when the change is a noop', async () => {
    await workflow.executeStateChange(() => Promise.resolve(noop()));

    expect(statusService.recomputeStatus).not.toHaveBeenCalled();
  });

  it('treats a deletion as a change that cannot recompute or emit', async () => {
    await workflow.executeStateChange(() =>
      Promise.resolve(deleted({ staleUrls: ['https://storage/deleted.png'] })),
    );

    expect(statusService.recomputeStatus).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'https://storage/deleted.png',
    ]);
  });

  it('does not delete stale files when none are reported', async () => {
    await workflow.executeStateChange(() =>
      Promise.resolve(change({ staleUrls: [] })),
    );

    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('deletes only the URLs nothing references any more', async () => {
    // The collection sites already filter, but the deleter asks again: a caller
    // that forgot cannot destroy an object a surviving row still points at.
    referencedness.filterReclaimableUrls.mockResolvedValue([
      'http://storage/stale.png',
    ]);

    await workflow.executeStateChange(() =>
      Promise.resolve(
        change({
          staleUrls: ['http://storage/stale.png', 'http://storage/live.png'],
        }),
      ),
    );

    expect(referencedness.filterReclaimableUrls).toHaveBeenCalledWith([
      'http://storage/stale.png',
      'http://storage/live.png',
    ]);
    expect(storage.deleteAll).toHaveBeenCalledWith([
      'http://storage/stale.png',
    ]);
  });

  it('deletes nothing when every reported URL is still referenced', async () => {
    referencedness.filterReclaimableUrls.mockResolvedValue([]);

    await workflow.executeStateChange(() =>
      Promise.resolve(change({ staleUrls: ['http://storage/live.png'] })),
    );

    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('logs stale-file deletion failures after commit', async () => {
    storage.deleteAll.mockResolvedValue({
      deleted: [],
      failed: [{ url: 'http://storage/stuck.png', error: 'network down' }],
    });

    vi.useFakeTimers();
    const promise = workflow.executeStateChange(() =>
      Promise.resolve(change({ staleUrls: ['http://storage/stuck.png'] })),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    vi.useRealTimers();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('http://storage/stuck.png'),
    );
  });

  it('retries stale-file deletion when storage throws transiently', async () => {
    storage.deleteAll
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ deleted: [], failed: [] });

    vi.useFakeTimers();
    const promise = workflow.executeStateChange(() =>
      Promise.resolve(change({ staleUrls: ['http://storage/stale.png'] })),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    vi.useRealTimers();

    expect(storage.deleteAll).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retrying'),
      expect.any(Object),
    );
  });

  it('still emits observability when the onSuccess callback throws', async () => {
    const cleanup = vi.fn().mockRejectedValue(new Error('cleanup failed'));

    await workflow.executeStateChange(
      () => Promise.resolve(change({ events: [screenshotEvent()] })),
      { onSuccess: cleanup },
    );

    expect(cleanup).toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalled();
  });

  it('times out a hung stale-file deletion instead of blocking the response', async () => {
    storage.deleteAll.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    vi.useFakeTimers();
    const promise = workflow.executeStateChange(() =>
      Promise.resolve(change({ staleUrls: ['http://storage/hung.png'] })),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;
    vi.useRealTimers();

    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'post_commit_callback_failures_total',
    );
  });

  it('continues cleanup when observability emission fails without throwing', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    logger.log.mockImplementation(() => {
      throw new Error('logger down');
    });

    await workflow.executeStateChange(
      () =>
        Promise.resolve(
          change({
            events: [screenshotEvent()],
            staleUrls: ['https://storage/stale.png'],
          }),
        ),
      { onSuccess: cleanup },
    );

    expect(storage.deleteAll).toHaveBeenCalledWith([
      'https://storage/stale.png',
    ]);
    expect(cleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        change: expect.objectContaining({ affectedTestIds: ['test-1'] }),
      }),
    );
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'post_commit_callback_failures_total',
    );
  });

  it('emits observability after commit even without an onSuccess hook', async () => {
    await workflow.executeStateChange(() =>
      Promise.resolve(change({ events: [screenshotEvent()] })),
    );

    expect(logger.log).toHaveBeenCalled();
  });

  it('does not emit when the change returns no events', async () => {
    await workflow.executeStateChange(() =>
      Promise.resolve(change({ events: [] })),
    );

    expect(logger.log).not.toHaveBeenCalled();
  });

  it('returns the transaction result', async () => {
    const result = await workflow.executeStateChange(() =>
      Promise.resolve(change({ events: [] })),
    );

    expect(result).toEqual(
      expect.objectContaining({
        change: expect.objectContaining({
          kind: 'change',
          affectedTestIds: ['test-1'],
        }),
      }),
    );
  });

  it('propagates a failed change without emitting observability', async () => {
    await expect(
      workflow.executeStateChange(vi.fn().mockRejectedValue(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(logger.log).not.toHaveBeenCalled();
  });

  describe('executeStateChange retry', () => {
    it('retries on serialization error and runs onSuccess once after success', async () => {
      const serializationError = new Prisma.PrismaClientKnownRequestError(
        'serialization',
        {
          code: 'P2034',
          clientVersion: 'test',
        },
      );
      uow.execute = vi
        .fn()
        .mockRejectedValueOnce(serializationError)
        .mockImplementationOnce(async (fn: () => Promise<unknown>) => fn());
      const fn = vi
        .fn()
        .mockResolvedValue(change({ events: [screenshotEvent()] }));
      const onSuccess = vi.fn().mockResolvedValue(undefined);

      vi.useFakeTimers();
      const promise = workflow.executeStateChange(fn, {
        retry: { isolationLevel: 'Serializable', maxAttempts: 3 },
        onSuccess,
      });
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;
      vi.useRealTimers();

      expect(result).toEqual(
        expect.objectContaining({
          change: expect.objectContaining({
            kind: 'change',
            affectedTestIds: ['test-1'],
          }),
        }),
      );
      expect(uow.execute).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          change: expect.objectContaining({ affectedTestIds: ['test-1'] }),
        }),
      );
      expect(logger.log).toHaveBeenCalled();
    });

    it('applies the default Serializable retry when no retry option is given', async () => {
      const spy = vi.spyOn(uow, 'execute');
      await workflow.executeStateChange(() =>
        Promise.resolve(change({ events: [] })),
      );

      expect(spy).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: 'Serializable',
        }),
      );
      spy.mockRestore();
    });
  });

  describe('executeWithStoredFile', () => {
    it('charges the project and byte count the caller named, before storing', async () => {
      const store = vi.fn(() => Promise.resolve('https://storage/new.png'));

      await workflow.executeWithStoredFile({
        charge: { projectName: 'shop', bytes: 2048 },
        store,
        change: () => Promise.resolve(noop()),
      });

      expect(storageUsage.assertWithinQuota).toHaveBeenCalledWith('shop', 2048);
      expect(
        storageUsage.assertWithinQuota.mock.invocationCallOrder[0],
      ).toBeLessThan(store.mock.invocationCallOrder[0] ?? 0);
    });

    it('leaves no object behind when the quota rejects the write', async () => {
      storageUsage.assertWithinQuota.mockRejectedValue(
        new DomainError('Storage quota exceeded', 'QUOTA_EXCEEDED'),
      );
      const store = vi.fn(() => Promise.resolve('https://storage/new.png'));

      await expect(
        workflow.executeWithStoredFile({
          charge: { projectName: 'shop', bytes: 10 },
          store,
          change: () => Promise.resolve(noop()),
        }),
      ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });

      expect(store).not.toHaveBeenCalled();
      expect(storage.deleteQuietly).not.toHaveBeenCalled();
    });

    it('stores the file, runs the change, and returns fileUrl + result', async () => {
      const result = await workflow.executeWithStoredFile({
        charge: { projectName: 'shop', bytes: 1024 },
        store: () => Promise.resolve('https://storage/new.png'),
        change: () => Promise.resolve(change({ staleUrls: [], events: [] })),
      });

      expect(result).toEqual({
        fileUrl: 'https://storage/new.png',
        change: expect.objectContaining({
          kind: 'change',
          affectedTestIds: ['test-1'],
        }),
      });
      expect(storage.deleteQuietly).not.toHaveBeenCalled();
    });

    it('emits events returned by the change into the state change', async () => {
      await workflow.executeWithStoredFile({
        charge: { projectName: 'shop', bytes: 1024 },
        store: () => Promise.resolve('https://storage/new.png'),
        change: () => Promise.resolve(change({ events: [screenshotEvent()] })),
      });

      expect(logger.log).toHaveBeenCalled();
    });

    it('recomputes statuses from the affected testIds on the change result', async () => {
      await workflow.executeWithStoredFile({
        charge: { projectName: 'shop', bytes: 1024 },
        store: () => Promise.resolve('https://storage/new.png'),
        change: () => Promise.resolve(change({ affectedTestIds: ['test-1'] })),
      });

      expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
    });

    it('deletes stale urls reported by the change after commit', async () => {
      await workflow.executeWithStoredFile({
        charge: { projectName: 'shop', bytes: 1024 },
        store: () => Promise.resolve('https://storage/new.png'),
        change: () =>
          Promise.resolve(change({ staleUrls: ['https://storage/old-1.png'] })),
      });

      expect(storage.deleteAll).toHaveBeenCalledWith([
        'https://storage/old-1.png',
      ]);
    });

    it('deletes the stored file when the change fails', async () => {
      await expect(
        workflow.executeWithStoredFile({
          charge: { projectName: 'shop', bytes: 1024 },
          store: () => Promise.resolve('https://storage/new.png'),
          change: () => Promise.reject(new Error('boom')),
        }),
      ).rejects.toThrow('boom');

      expect(storage.deleteQuietly).toHaveBeenCalledWith(
        'https://storage/new.png',
      );
    });

    it('does not compensate when no file was stored', async () => {
      await expect(
        workflow.executeWithStoredFile({
          charge: { projectName: 'shop', bytes: 1024 },
          store: () => Promise.reject(new Error('upload boom')),
          change: () => Promise.resolve(noop()),
        }),
      ).rejects.toThrow('upload boom');

      expect(storage.deleteQuietly).not.toHaveBeenCalled();
    });
  });
});
