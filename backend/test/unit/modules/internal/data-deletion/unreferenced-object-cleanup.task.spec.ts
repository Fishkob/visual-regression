import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnreferencedObjectCleanupTask } from '@internal/data-deletion/tasks/unreferenced-object-cleanup.task';
import { StorageObjectName } from '@internal/storage/services/storage-object-name';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import type { MaintenanceTask } from '@common/domain/maintenance-task.interface';
import {
  STORAGE_OBJECT_REFERENCEDNESS,
  IStorageObjectReferencedness,
} from '@common/domain/storage-referencedness.interface';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

const HOURS_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 24 * HOURS_MS;

describe('UnreferencedObjectCleanupTask', () => {
  let task: UnreferencedObjectCleanupTask;
  let storage: Mocked<IStorageProvider>;
  let objectNames: StorageObjectName;
  let referencedness: Mocked<IStorageObjectReferencedness>;
  let logger: Mocked<AppLoggerService>;

  beforeEach(async () => {
    storage = createMock<IStorageProvider>();
    storage.listObjectsWithLastModified.mockResolvedValue([]);
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });
    objectNames = new StorageObjectName({
      rustfs: { publicUrl: 'http://localhost:9000', bucket: 'screenshots' },
    } as never);
    storage.toPublicUrl.mockImplementation((name) =>
      objectNames.toPublicUrl(name),
    );
    referencedness = createMock<IStorageObjectReferencedness>();
    referencedness.findReferencedUrls.mockImplementation((urls) =>
      Promise.resolve(urls),
    );
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnreferencedObjectCleanupTask,
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: STORAGE_OBJECT_REFERENCEDNESS, useValue: referencedness },
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    task = module.get(UnreferencedObjectCleanupTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const old = () => new Date(Date.now() - (MAX_AGE_MS + HOURS_MS));
  const recent = () => new Date();
  const url = (name: string) => `http://localhost:9000/screenshots/${name}`;

  it('implements MaintenanceTask with its own lock id', () => {
    const asTask = task as unknown as MaintenanceTask;
    expect(asTask.lockId).toBe(1004);
    expect(asTask.label).toBe('unreferenced object cleanup');
  });

  it('lists the whole bucket root to find candidates', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'candidate.png', lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([]);

    await task.execute();

    expect(storage.listObjectsWithLastModified).toHaveBeenCalledWith(
      '',
      expect.any(Number),
    );
  });

  it('lists the whole bucket with a budget far beyond the 30s per-op cap', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([]);

    await task.execute();

    const [, budget] = storage.listObjectsWithLastModified.mock.calls[0] as [
      string,
      number,
    ];
    expect(budget).toBeGreaterThan(30_000);
  });

  it('deletes only old and unreferenced objects', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'old-orphan.png', lastModified: old() },
      { name: 'old-referenced.png', lastModified: old() },
      { name: 'fresh-orphan.png', lastModified: recent() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([
      url('old-referenced.png'),
    ]);
    storage.deleteAll.mockResolvedValue({
      deleted: [url('old-orphan.png')],
      failed: [],
    });

    const result = await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([url('old-orphan.png')]);
    expect(result.counters).toEqual([
      { name: 'cleanup_unreferenced_objects_total', value: 1 },
    ]);
    expect(result.gauges).toHaveLength(1);
  });

  it('skips the pdf-render/ namespace', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'pdf-render/base/pagecount', lastModified: old() },
      { name: 'candidate.png', lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([]);

    await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([url('candidate.png')]);
  });

  it('skips objects whose lastModified is unknown', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'no-age.png', lastModified: null },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([]);

    await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(referencedness.findReferencedUrls).not.toHaveBeenCalled();
  });

  it('keeps URLs referenced by a screenshot or comparison row', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'candidate.png', lastModified: old() },
      { name: 'screenshot.png', lastModified: old() },
      { name: 'diff.png', lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([
      url('screenshot.png'),
      url('diff.png'),
    ]);

    await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([url('candidate.png')]);
  });

  it('skips deletion when every candidate is referenced', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'screenshot.png', lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([
      url('screenshot.png'),
    ]);

    await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('re-checks the unreferenced predicate at delete time and skips a URL referenced in the window', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'claimed.png', lastModified: old() },
      { name: 'orphan.png', lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValueOnce([]);
    referencedness.findReferencedUrls.mockResolvedValueOnce([
      url('claimed.png'),
    ]);
    storage.deleteAll.mockResolvedValue({
      deleted: [url('orphan.png')],
      failed: [],
    });

    const result = await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([url('orphan.png')]);
    expect(result.counters).toEqual([
      { name: 'cleanup_unreferenced_objects_total', value: 1 },
    ]);
  });

  it('does not re-scan when there is nothing to delete', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'screenshot.png', lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([
      url('screenshot.png'),
    ]);

    await task.execute();

    expect(referencedness.findReferencedUrls).toHaveBeenCalledTimes(1);
    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('logs a warning and counts only confirmed deletions on partial failure', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'deleted.png', lastModified: old() },
      { name: 'failed.png', lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([]);
    storage.deleteAll.mockResolvedValue({
      deleted: [url('deleted.png')],
      failed: [{ url: url('failed.png'), error: 'rustfs down' }],
    });

    const result = await task.execute();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(url('failed.png')),
    );
    expect(result.counters).toEqual([
      { name: 'cleanup_unreferenced_objects_total', value: 1 },
    ]);
  });

  it('reports zero when no old objects exist', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'fresh-orphan.png', lastModified: recent() },
    ]);

    const result = await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(result.counters).toEqual([
      { name: 'cleanup_unreferenced_objects_total', value: 0 },
    ]);
  });
});
