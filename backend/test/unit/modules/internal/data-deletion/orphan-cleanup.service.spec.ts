import type { Mock, Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { OrphanCleanupService } from '@internal/data-deletion/services/orphan-cleanup.service';
import {
  ORPHAN_SWEEP,
  IOrphanSweep,
} from '@common/domain/orphan-sweep.interface';
import {
  STORAGE_OBJECT_REFERENCEDNESS,
  IStorageObjectReferencedness,
} from '@common/domain/storage-referencedness.interface';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { STORAGE_PROVIDER } from '@common/domain/storage-provider.interface';
import type { MaintenanceTask } from '@common/domain/maintenance-task.interface';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { ScreenshotType } from '@public/visualTest/core/domain/types/visual-test.types';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('OrphanCleanupService', () => {
  let service: OrphanCleanupService;
  let referencedness: Mocked<IStorageObjectReferencedness>;
  let orphaned: Mocked<IOrphanSweep>;
  let storage: Mocked<{ deleteAll: Mock }>;
  let uow: Mocked<PrismaUnitOfWork>;
  let logger: Mocked<AppLoggerService>;

  function mockScreenshot(id: string) {
    return new ScreenshotEntity({
      id,
      visualTestId: id,
      type: ScreenshotType.BASELINE,
      imageHash: 'hash-default',
      imageUrl: `http://storage/${id}.png`,
      variant: Variant.fromStrings('1920x1080', 'Chrome', 'ci'),
      pixelDiffThreshold: 0,
      createdAt: new Date(),
    });
  }

  beforeEach(async () => {
    referencedness = createMock<IStorageObjectReferencedness>();
    referencedness.filterReclaimableUrls.mockImplementation(
      async (urls: string[]) => urls,
    );
    orphaned = createMock<IOrphanSweep>();
    orphaned.deleteCurrentOrphansByIds.mockImplementation(
      async (ids) => ids.length,
    );
    orphaned.deleteBaselineOrphansByIdsReturningUrls.mockImplementation(
      async (ids) => ids.map((id) => `http://storage/${id}.png`),
    );
    storage = createMock<{ deleteAll: Mock }>();
    uow = createMock<PrismaUnitOfWork>();
    uow.execute.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrphanCleanupService,
        { provide: STORAGE_OBJECT_REFERENCEDNESS, useValue: referencedness },
        { provide: ORPHAN_SWEEP, useValue: orphaned },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: PrismaUnitOfWork, useValue: uow },
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(OrphanCleanupService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deleteOrphanedScreenshots', () => {
    it('deletes both current and baseline orphans and returns total count', async () => {
      const currentOrphans = [mockScreenshot('ss-1'), mockScreenshot('ss-2')];
      const baselineOrphans = [mockScreenshot('ss-3')];
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: currentOrphans,
      });
      orphaned.findOrphanedBaseline.mockResolvedValue(baselineOrphans);
      storage.deleteAll.mockImplementation(async (urls: string[]) => ({
        deleted: urls,
        failed: [],
      }));

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 3 });
      expect(orphaned.deleteCurrentOrphansByIds).toHaveBeenCalledTimes(1);
      expect(orphaned.deleteCurrentOrphansByIds).toHaveBeenCalledWith([
        'ss-1',
        'ss-2',
      ]);
      expect(
        orphaned.deleteBaselineOrphansByIdsReturningUrls,
      ).toHaveBeenCalledTimes(1);
      expect(
        orphaned.deleteBaselineOrphansByIdsReturningUrls,
      ).toHaveBeenCalledWith(['ss-3'], { defaultGraceHours: 24 });
      expect(storage.deleteAll).toHaveBeenCalledTimes(2);
    });

    it('returns 0 when no orphans exist', async () => {
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: [],
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 0 });
      expect(orphaned.deleteCurrentOrphansByIds).not.toHaveBeenCalled();
      expect(storage.deleteAll).not.toHaveBeenCalled();
    });

    it('keeps DB records whose storage deletion failed so the next run retries them', async () => {
      const orphans = [mockScreenshot('ss-1')];
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: orphans,
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);
      storage.deleteAll.mockResolvedValue({
        deleted: [],
        failed: [{ url: 'http://storage/ss-1.png', error: 'deletion failed' }],
      });

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 0 });
      expect(orphaned.deleteCurrentOrphansByIds).not.toHaveBeenCalled();
      expect(storage.deleteAll).toHaveBeenCalledTimes(1);
    });

    it('deletes storage before DB rows and returns count of fully-removed records', async () => {
      const orphans = [mockScreenshot('ss-1')];
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: orphans,
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);
      storage.deleteAll.mockResolvedValue({
        deleted: ['http://storage/ss-1.png'],
        failed: [],
      });

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 1 });
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/ss-1.png',
      ]);
      expect(orphaned.deleteCurrentOrphansByIds).toHaveBeenCalledWith(['ss-1']);
    });

    it('only deletes DB rows for storage files that were actually removed', async () => {
      const orphans = [mockScreenshot('ss-1'), mockScreenshot('ss-2')];
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: orphans,
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);
      storage.deleteAll.mockResolvedValue({
        deleted: ['http://storage/ss-1.png'],
        failed: [{ url: 'http://storage/ss-2.png', error: 'deletion failed' }],
      });

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 1 });
      expect(orphaned.deleteCurrentOrphansByIds).toHaveBeenCalledWith(['ss-1']);
      expect(orphaned.deleteCurrentOrphansByIds).toHaveBeenCalledTimes(1);
    });

    it('keeps the storage file of a current orphan that is shared with an approved baseline', async () => {
      const orphans = [mockScreenshot('ss-1')];
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: orphans,
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);
      referencedness.filterReclaimableUrls.mockResolvedValue([]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 1 });
      expect(storage.deleteAll).not.toHaveBeenCalled();
      expect(orphaned.deleteCurrentOrphansByIds).toHaveBeenCalledWith(['ss-1']);
    });

    it('deletes storage before DB rows (storage-first ordering)', async () => {
      const orphans = [mockScreenshot('ss-1')];
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: orphans,
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);
      storage.deleteAll.mockResolvedValue({
        deleted: ['http://storage/ss-1.png'],
        failed: [],
      });

      const order: string[] = [];
      storage.deleteAll.mockImplementation(async () => {
        order.push('storage');
        return { deleted: [], failed: [] };
      });
      orphaned.deleteCurrentOrphansByIds.mockImplementation(async () => {
        order.push('db');
        return 1;
      });
      uow.execute.mockImplementation(async (fn: () => Promise<unknown>) =>
        fn(),
      );

      await service.deleteOrphanedScreenshots();

      expect(order).toEqual(['storage', 'db']);
    });

    it('excludes a baseline-shared url from storage deletion but still deletes its DB row', async () => {
      const orphans = [mockScreenshot('ss-1'), mockScreenshot('ss-2')];
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: orphans,
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);
      referencedness.filterReclaimableUrls.mockResolvedValue([
        'http://storage/ss-2.png',
      ]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 2 });
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/ss-2.png',
      ]);
      expect(orphaned.deleteCurrentOrphansByIds).toHaveBeenCalledWith([
        'ss-1',
        'ss-2',
      ]);
    });

    it('handles only baseline orphans', async () => {
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: [],
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([
        mockScreenshot('ss-1'),
        mockScreenshot('ss-2'),
      ]);
      storage.deleteAll.mockResolvedValue({
        deleted: ['http://storage/ss-1.png', 'http://storage/ss-2.png'],
        failed: [],
      });
      referencedness.filterReclaimableUrls.mockImplementation(
        async (urls: string[]) => urls,
      );
      orphaned.deleteBaselineOrphansByIdsReturningUrls.mockResolvedValue([
        'http://storage/ss-1.png',
        'http://storage/ss-2.png',
      ]);

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 2 });
      expect(
        orphaned.deleteBaselineOrphansByIdsReturningUrls,
      ).toHaveBeenCalledWith(['ss-1', 'ss-2'], { defaultGraceHours: 24 });
      // Baseline reclaim is row-first: the file is deleted only for the rows
      // the guarded DELETE actually removed — never before the row survives.
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/ss-1.png',
        'http://storage/ss-2.png',
      ]);
    });

    it('reclaims baseline files only after the guarded row delete returns them', async () => {
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: [],
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([mockScreenshot('ss-1')]);
      referencedness.filterReclaimableUrls.mockImplementation(
        async (urls: string[]) => urls,
      );
      orphaned.deleteBaselineOrphansByIdsReturningUrls.mockResolvedValue([
        'http://storage/ss-1.png',
      ]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      const order: string[] = [];
      orphaned.deleteBaselineOrphansByIdsReturningUrls.mockImplementation(
        async () => {
          order.push('db');
          return ['http://storage/ss-1.png'];
        },
      );
      storage.deleteAll.mockImplementation(async () => {
        order.push('storage');
        return { deleted: [], failed: [] };
      });

      await service.deleteOrphanedScreenshots();

      // Row-first: DB delete precedes the file delete for baselines (the
      // opposite of the storage-first current-orphan path).
      expect(order).toEqual(['db', 'storage']);
    });

    it('keeps a baseline file whose row was NOT deleted by the guard', async () => {
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: [],
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([mockScreenshot('ss-1')]);
      referencedness.filterReclaimableUrls.mockImplementation(
        async (urls: string[]) => urls,
      );
      orphaned.deleteBaselineOrphansByIdsReturningUrls.mockResolvedValue([]);

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 0 });
      expect(storage.deleteAll).not.toHaveBeenCalled();
    });

    it('queries both orphan types concurrently', async () => {
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: [],
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);

      await service.deleteOrphanedScreenshots();

      expect(orphaned.findOrphanedCurrent).toHaveBeenCalledTimes(1);
      expect(orphaned.findOrphanedBaseline).toHaveBeenCalledTimes(1);
    });

    it('warns and skips current cleanup when an active job has NULL candidateId', async () => {
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: true,
        screenshots: [],
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);

      const result = await service.deleteOrphanedScreenshots();

      expect(result).toEqual({ deleted: 0 });
      expect(orphaned.deleteCurrentOrphansByIds).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('NULL candidateId'),
      );
    });
  });

  describe('MaintenanceTask interface', () => {
    it('implements MaintenanceTask with lockId and label', () => {
      const task = service as unknown as MaintenanceTask;
      expect(task.lockId).toBe(1001);
      expect(task.label).toBe('orphaned cleanup');
    });

    it('execute returns counters and gauges when orphans deleted', async () => {
      const currentOrphans = [mockScreenshot('ss-1'), mockScreenshot('ss-2')];
      const baselineOrphans = [mockScreenshot('ss-3')];
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: currentOrphans,
      });
      orphaned.findOrphanedBaseline.mockResolvedValue(baselineOrphans);
      storage.deleteAll.mockImplementation(async (urls: string[]) => ({
        deleted: urls,
        failed: [],
      }));

      const task = service as unknown as MaintenanceTask;
      const result = await task.execute();

      expect(result.counters).toEqual([
        {
          name: 'cleanup_orphaned_screenshots_total',
          value: 3,
        },
      ]);
      expect(result.gauges).toHaveLength(1);
      expect(result.gauges![0].name).toBe(
        'cleanup_orphaned_screenshots_last_run',
      );
      expect(result.gauges![0].value).toBeGreaterThan(1e12);
    });

    it('execute still reports a single counter when zero orphans', async () => {
      orphaned.findOrphanedCurrent.mockResolvedValue({
        skipped: false,
        screenshots: [],
      });
      orphaned.findOrphanedBaseline.mockResolvedValue([]);

      const task = service as unknown as MaintenanceTask;
      const result = await task.execute();

      expect(result.counters).toEqual([
        { name: 'cleanup_orphaned_screenshots_total', value: 0 },
      ]);
    });
  });
});
