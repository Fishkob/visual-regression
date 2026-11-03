import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import {
  ORPHAN_DELETE_CHUNK_SIZE,
  ORPHAN_SWEEP_BATCH_SIZE,
  OrphanedScreenshotRepository,
} from '@public/visualTest/core/infrastructure/repositories/orphaned-screenshot.repository';
import { createMock } from '@test/utils/create-mock';
import { sqlText, sqlValues } from '@test/utils/raw-sql';

// Counts the bind parameters of a tagged-template call, expanding the `Prisma.sql`
// fragments a template embeds (`Prisma.join(ids)`, `Prisma.join(statuses)`).
function bindCount(values: unknown[]): number {
  let count = 0;
  for (const value of values) {
    const nested = (value as { values?: unknown[] }).values;
    count += Array.isArray(nested) ? nested.length : 1;
  }
  return count;
}

function manyIds(count: number): string[] {
  return Array.from(
    { length: count },
    (_unused, index) => `ss-${String(index)}`,
  );
}

function makeMockClient() {
  return {
    unifiedScreenshot: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    comparisonJob: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  };
}

describe('OrphanedScreenshotRepository', () => {
  let repository: OrphanedScreenshotRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;
  const now = new Date('2025-01-01T00:00:00Z');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mockClient = makeMockClient();

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });
    mockClient.comparisonJob.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrphanedScreenshotRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(OrphanedScreenshotRepository);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('findOrphanedCurrent', () => {
    it('returns current screenshots with no candidate comparison or owning job', async () => {
      const screenshots = [
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ];
      mockClient.$queryRaw.mockResolvedValue(screenshots);

      const result = await repository.findOrphanedCurrent();

      expect(result).toEqual({ skipped: false, screenshots });
      const [call] = mockClient.$queryRaw.mock.calls;
      expect(sqlText(call)).toContain('FROM "UnifiedScreenshot" s');
      expect(sqlText(call)).toContain('NOT EXISTS');
      expect(sqlText(call)).toContain('FROM "ComparisonJob" j');
      expect(sqlText(call)).toContain('FROM "UnifiedComparison" c');
      expect(sqlText(call)).toContain('LIMIT');
      expect(sqlValues(call)).toEqual([
        'PENDING',
        'PROCESSING',
        'FAILED',
        ORPHAN_SWEEP_BATCH_SIZE,
      ]);
    });

    it('excludes candidates an owning job references without materializing an id list', async () => {
      mockClient.$queryRaw.mockResolvedValue([
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ]);

      await repository.findOrphanedCurrent();

      // The exclusion is a correlated subquery in the SELECT, not a findMany
      // that loads every in-flight candidate id into the statement.
      expect(mockClient.comparisonJob.findMany).not.toHaveBeenCalled();
      const [call] = mockClient.$queryRaw.mock.calls;
      expect(sqlText(call)).toContain('j."candidateId" = s."id"');
      expect(sqlText(call)).toContain('j."candidateId" IS NULL');
    });

    it('returns empty array when no orphaned currents', async () => {
      mockClient.$queryRaw.mockResolvedValue([]);

      const result = await repository.findOrphanedCurrent();

      expect(result).toEqual({ skipped: false, screenshots: [] });
    });

    it('skips the sweep when an active job has NULL candidateId (unknown candidate)', async () => {
      mockClient.comparisonJob.findFirst.mockResolvedValue({
        id: 'legacy-job',
      });

      const result = await repository.findOrphanedCurrent();

      expect(result).toEqual({ skipped: true, screenshots: [] });
      expect(mockClient.comparisonJob.findFirst).toHaveBeenCalledWith({
        where: {
          status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
          candidateId: null,
        },
        select: { id: true },
      });
      expect(mockClient.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('findOrphanedBaseline', () => {
    it('selects orphaned baselines whose project grace has elapsed', async () => {
      const screenshots = [
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ];
      mockClient.$queryRaw.mockResolvedValue(screenshots);

      const result = await repository.findOrphanedBaseline({
        defaultGraceHours: 24,
      });

      expect(result).toEqual([
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ]);
      const sql = sqlText(mockClient.$queryRaw.mock.calls[0] as unknown[]);
      // The grace is the project's own, with the caller's default as fallback.
      expect(sql).toContain('"orphanGraceHours"');
      expect(sql).toContain('make_interval');
      expect(sql).toContain('"UnifiedVariant" v');
      expect(sql).toContain('"UnifiedComparison" c');
    });

    it('passes the default grace as a bound parameter', async () => {
      mockClient.$queryRaw.mockResolvedValue([]);

      await repository.findOrphanedBaseline({ defaultGraceHours: 6 });

      const sql = sqlText(mockClient.$queryRaw.mock.calls[0] as unknown[]);
      expect(sql).toContain('COALESCE(p."orphanGraceHours", ?)');
    });

    it('bounds the scan to one sweep batch instead of returning every orphan', async () => {
      mockClient.$queryRaw.mockResolvedValue([]);

      await repository.findOrphanedBaseline({ defaultGraceHours: 24 });

      const sql = sqlText(mockClient.$queryRaw.mock.calls[0] as unknown[]);
      expect(sql).toContain(`LIMIT ${ORPHAN_SWEEP_BATCH_SIZE}`);
      expect(sql).not.toContain('LIMIT LIMIT');
    });
  });

  describe('deleteBaselineOrphansByIdsReturningUrls', () => {
    it('deletes only baselines with no variant link and no comparison reference and returns their URLs', async () => {
      mockClient.$queryRaw.mockResolvedValue([
        { imageUrl: 'http://storage/ss-1.png' },
        { imageUrl: 'http://storage/ss-2.png' },
      ]);

      const result = await repository.deleteBaselineOrphansByIdsReturningUrls(
        ['ss-1', 'ss-2'],
        { defaultGraceHours: 24 },
      );

      expect(result).toEqual([
        'http://storage/ss-1.png',
        'http://storage/ss-2.png',
      ]);
      expect(mockClient.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = sqlText(mockClient.$queryRaw.mock.calls[0] as unknown[]);
      expect(sql).toContain('"UnifiedScreenshot" s');
      expect(sql).toContain('"UnifiedVariant" v');
      expect(sql).toContain('"UnifiedComparison" c');
      expect(sql).toContain('RETURNING s."imageUrl"');
      // Same grace predicate as the find, so the two cannot diverge.
      expect(sql).toContain('COALESCE(p."orphanGraceHours", ?)');
    });

    it('does nothing for an empty id list', async () => {
      const result = await repository.deleteBaselineOrphansByIdsReturningUrls(
        [],
        { defaultGraceHours: 24 },
      );

      expect(result).toEqual([]);
      expect(mockClient.$queryRaw).not.toHaveBeenCalled();
    });

    it('chunks a large id list and returns the union of the deleted URLs', async () => {
      mockClient.$queryRaw
        .mockResolvedValueOnce([{ imageUrl: 'http://storage/chunk-1.png' }])
        .mockResolvedValueOnce([{ imageUrl: 'http://storage/chunk-2.png' }])
        .mockResolvedValueOnce([{ imageUrl: 'http://storage/chunk-3.png' }]);
      const ids = manyIds(2500);

      const result = await repository.deleteBaselineOrphansByIdsReturningUrls(
        ids,
        { defaultGraceHours: 24 },
      );

      expect(result).toEqual([
        'http://storage/chunk-1.png',
        'http://storage/chunk-2.png',
        'http://storage/chunk-3.png',
      ]);
      expect(mockClient.$queryRaw).toHaveBeenCalledTimes(
        Math.ceil(2500 / ORPHAN_DELETE_CHUNK_SIZE),
      );
      const bindsPerStatement = mockClient.$queryRaw.mock.calls.map(
        (call: unknown[]) => sqlValues(call).length,
      );
      expect(bindsPerStatement).toEqual([
        ORPHAN_DELETE_CHUNK_SIZE + 1,
        ORPHAN_DELETE_CHUNK_SIZE + 1,
        500 + 1,
      ]);
    });
  });

  describe('deleteCurrentOrphansByIds', () => {
    it('deletes current rows guarded by a single atomic statement', async () => {
      mockClient.$executeRaw.mockResolvedValue(2);

      const result = await repository.deleteCurrentOrphansByIds([
        'ss-1',
        'ss-2',
      ]);

      expect(result).toBe(2);
      expect(mockClient.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('guards against an active job with NULL candidateId in the delete predicate', async () => {
      mockClient.$executeRaw.mockResolvedValue(1);

      await repository.deleteCurrentOrphansByIds(['ss-1']);

      const sql = mockClient.$executeRaw.mock.calls[0][0];
      expect(String(sql)).toContain('j."candidateId" = s.id');
      expect(String(sql)).toContain('j."candidateId" IS NULL');
    });

    it('does nothing for an empty id list', async () => {
      await repository.deleteCurrentOrphansByIds([]);

      expect(mockClient.$executeRaw).not.toHaveBeenCalled();
    });

    it('chunks a large id list into bounded statements and sums the deleted rows', async () => {
      mockClient.$executeRaw
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(500);

      const result = await repository.deleteCurrentOrphansByIds(manyIds(2500));

      expect(result).toBe(2500);
      expect(mockClient.$executeRaw).toHaveBeenCalledTimes(
        Math.ceil(2500 / ORPHAN_DELETE_CHUNK_SIZE),
      );
      const bindsPerStatement = mockClient.$executeRaw.mock.calls.map(
        (call: unknown[]) => bindCount(call.slice(1)),
      );
      // One bind per id plus the three candidate-owning job statuses.
      expect(bindsPerStatement).toEqual([
        ORPHAN_DELETE_CHUNK_SIZE + 3,
        ORPHAN_DELETE_CHUNK_SIZE + 3,
        500 + 3,
      ]);
    });
  });
});
