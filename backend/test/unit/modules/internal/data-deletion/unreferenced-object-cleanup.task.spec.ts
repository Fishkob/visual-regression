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
import { createHash } from 'node:crypto';
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

  // Every object this app writes is `<sha256>-<uuid>.<ext>` (`.diff` for
  // comparison diffs). The sweep only deletes names matching that shape.
  const managedName = (seed: string): string => {
    const hash = createHash('sha256').update(seed).digest('hex');
    const uuidHex = createHash('md5').update(seed).digest('hex');
    const uuid = `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20, 32)}`;
    return `${hash}-${uuid}.png`;
  };

  it('implements MaintenanceTask with its own lock id', () => {
    const asTask = task as unknown as MaintenanceTask;
    expect(asTask.lockId).toBe(1004);
    expect(asTask.label).toBe('unreferenced object cleanup');
  });

  it('lists the whole bucket root to find candidates', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: managedName('candidate'), lastModified: old() },
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
      { name: managedName('old-orphan'), lastModified: old() },
      { name: managedName('old-referenced'), lastModified: old() },
      { name: managedName('fresh-orphan'), lastModified: recent() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([
      url(managedName('old-referenced')),
    ]);
    storage.deleteAll.mockResolvedValue({
      deleted: [url(managedName('old-orphan'))],
      failed: [],
    });

    const result = await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([
      url(managedName('old-orphan')),
    ]);
    expect(result.counters).toEqual([
      { name: 'cleanup_unreferenced_objects_total', value: 1 },
    ]);
    expect(result.gauges).toHaveLength(1);
  });

  it('skips the pdf-render/ namespace', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'pdf-render/base/pagecount', lastModified: old() },
      { name: managedName('candidate'), lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([]);

    await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([
      url(managedName('candidate')),
    ]);
  });

  it('skips objects whose lastModified is unknown', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: managedName('no-age'), lastModified: null },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([]);

    await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(referencedness.findReferencedUrls).not.toHaveBeenCalled();
  });

  it('keeps URLs referenced by a screenshot or comparison row', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: managedName('candidate'), lastModified: old() },
      { name: managedName('screenshot'), lastModified: old() },
      { name: managedName('diff'), lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([
      url(managedName('screenshot')),
      url(managedName('diff')),
    ]);

    await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([
      url(managedName('candidate')),
    ]);
  });

  it('skips deletion when every candidate is referenced', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: managedName('screenshot'), lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([
      url(managedName('screenshot')),
    ]);

    await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('re-checks the unreferenced predicate at delete time and skips a URL referenced in the window', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: managedName('claimed'), lastModified: old() },
      { name: managedName('orphan'), lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValueOnce([]);
    referencedness.findReferencedUrls.mockResolvedValueOnce([
      url(managedName('claimed')),
    ]);
    storage.deleteAll.mockResolvedValue({
      deleted: [url(managedName('orphan'))],
      failed: [],
    });

    const result = await task.execute();

    expect(storage.deleteAll).toHaveBeenCalledWith([
      url(managedName('orphan')),
    ]);
    expect(result.counters).toEqual([
      { name: 'cleanup_unreferenced_objects_total', value: 1 },
    ]);
  });

  it('does not re-scan when there is nothing to delete', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: managedName('screenshot'), lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([
      url(managedName('screenshot')),
    ]);

    await task.execute();

    expect(referencedness.findReferencedUrls).toHaveBeenCalledTimes(1);
    expect(storage.deleteAll).not.toHaveBeenCalled();
  });

  it('logs a warning and counts only confirmed deletions on partial failure', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: managedName('deleted'), lastModified: old() },
      { name: managedName('failed'), lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([]);
    storage.deleteAll.mockResolvedValue({
      deleted: [url(managedName('deleted'))],
      failed: [{ url: url(managedName('failed')), error: 'rustfs down' }],
    });

    const result = await task.execute();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(url(managedName('failed'))),
    );
    expect(result.counters).toEqual([
      { name: 'cleanup_unreferenced_objects_total', value: 1 },
    ]);
  });

  it('never deletes an object this installation did not write', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'other-app/report.pdf', lastModified: old() },
      { name: managedName('ours'), lastModified: old() },
    ]);
    referencedness.findReferencedUrls.mockResolvedValue([]);
    storage.deleteAll.mockResolvedValue({
      deleted: [url(managedName('ours'))],
      failed: [],
    });

    await task.execute();

    // The bucket is listed whole, so a shared bucket must not be emptied: the
    // foreign object is neither looked up nor deleted.
    expect(storage.deleteAll).toHaveBeenCalledWith([url(managedName('ours'))]);
    expect(referencedness.findReferencedUrls).toHaveBeenCalledWith([
      url(managedName('ours')),
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not created by this installation'),
    );
  });

  it('reports zero when no old objects exist', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: managedName('fresh-orphan'), lastModified: recent() },
    ]);

    const result = await task.execute();

    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(result.counters).toEqual([
      { name: 'cleanup_unreferenced_objects_total', value: 0 },
    ]);
  });
});
