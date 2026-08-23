import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PdfRenderCacheCleanupTask } from '@internal/data-deletion/tasks/pdf-render-cache-cleanup.task';
import { StorageObjectName } from '@internal/storage/services/storage-object-name';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  PDF_RENDER_CACHE,
  IPdfRenderCache,
} from '@common/domain/pdf-sidecar.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import type { MaintenanceTask } from '@common/domain/maintenance-task.interface';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('PdfRenderCacheCleanupTask', () => {
  let task: PdfRenderCacheCleanupTask;
  let storage: Mocked<IStorageProvider>;
  let objectNames: StorageObjectName;
  let renderCache: Mocked<IPdfRenderCache>;
  let logger: Mocked<AppLoggerService>;

  beforeEach(async () => {
    storage = createMock<IStorageProvider>();
    objectNames = new StorageObjectName({
      rustfs: { publicUrl: 'http://localhost:9000', bucket: 'screenshots' },
    } as never);
    storage.toPublicUrl.mockImplementation((name) =>
      objectNames.toPublicUrl(name),
    );
    renderCache = createMock<IPdfRenderCache>();
    renderCache.clearCache.mockResolvedValue(true);
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfRenderCacheCleanupTask,
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: PDF_RENDER_CACHE, useValue: renderCache },
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    task = module.get(PdfRenderCacheCleanupTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('implements MaintenanceTask with its own lock id', () => {
    const asTask = task as unknown as MaintenanceTask;
    expect(asTask.lockId).toBe(1003);
    expect(asTask.label).toBe('pdf render cache cleanup');
  });

  it('evicts caches whose base PDF object no longer exists', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue(
      [
        'pdf-render/abc-1/pagecount',
        'pdf-render/abc-1/3/page-1.png',
        'pdf-render/def-2/pagecount',
      ].map((name) => ({ name, lastModified: null })),
    );
    storage.exists.mockImplementation((url) =>
      Promise.resolve(url.includes('abc-1')),
    );

    const result = await task.execute();

    expect(storage.listObjectsWithLastModified).toHaveBeenCalledWith(
      'pdf-render/',
      600000,
    );
    expect(storage.exists).toHaveBeenCalledWith(
      'http://localhost:9000/screenshots/abc-1.pdf',
    );
    expect(storage.exists).toHaveBeenCalledWith(
      'http://localhost:9000/screenshots/def-2.pdf',
    );
    expect(renderCache.clearCache).toHaveBeenCalledTimes(1);
    expect(renderCache.clearCache).toHaveBeenCalledWith(
      'http://localhost:9000/screenshots/def-2.pdf',
    );
    expect(result.counters).toEqual([
      { name: 'cleanup_pdf_render_cache_total', value: 1 },
    ]);
    expect(result.gauges).toHaveLength(1);
  });

  it('keeps caches whose base PDF still exists', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'pdf-render/abc-1/pagecount', lastModified: null },
    ]);
    storage.exists.mockResolvedValue(true);

    await task.execute();

    expect(renderCache.clearCache).not.toHaveBeenCalled();
  });

  it('reports zero when no render cache objects exist', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([]);

    const result = await task.execute();

    expect(renderCache.clearCache).not.toHaveBeenCalled();
    expect(result.counters).toEqual([
      { name: 'cleanup_pdf_render_cache_total', value: 0 },
    ]);
  });

  it('counts only evictions whose storage deletion succeeded', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue(
      [
        'pdf-render/abc-1/pagecount',
        'pdf-render/def-2/pagecount',
        'pdf-render/ghi-3/pagecount',
      ].map((name) => ({ name, lastModified: null })),
    );
    storage.exists.mockResolvedValue(false);
    renderCache.clearCache.mockResolvedValue(false);

    const result = await task.execute();

    expect(renderCache.clearCache).toHaveBeenCalledTimes(3);
    expect(result.counters).toEqual([
      { name: 'cleanup_pdf_render_cache_total', value: 0 },
    ]);
  });

  it('logs a warning when the storage deletion fails', async () => {
    storage.listObjectsWithLastModified.mockResolvedValue([
      { name: 'pdf-render/def-2/pagecount', lastModified: null },
    ]);
    storage.exists.mockResolvedValue(false);
    renderCache.clearCache.mockResolvedValue(false);

    await task.execute();

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to delete orphaned PDF render cache for "def-2"',
    );
    expect(logger.log).not.toHaveBeenCalled();
  });
});
