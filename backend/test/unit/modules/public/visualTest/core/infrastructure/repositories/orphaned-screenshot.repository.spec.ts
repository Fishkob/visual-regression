import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { OrphanedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/orphaned-screenshot.repository';
import { createMock } from '@test/utils/create-mock';

describe('OrphanedScreenshotRepository', () => {
  let repository: OrphanedScreenshotRepository;
  let mockTxCtx: jest.Mocked<TransactionContext>;
  let mockClient: any;
  const now = new Date('2025-01-01T00:00:00Z');

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    mockClient = {
      unifiedScreenshot: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      comparisonJob: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
    };

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
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('findOrphanedCurrent', () => {
    it('returns current screenshots with no candidate comparison', async () => {
      const screenshots = [
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ];
      mockClient.comparisonJob.findMany.mockResolvedValue([]);
      mockClient.unifiedScreenshot.findMany.mockResolvedValue(screenshots);

      const result = await repository.findOrphanedCurrent();

      expect(result).toEqual({
        skipped: false,
        screenshots: [{ id: 'ss-1', imageUrl: 'http://example.com/img.png' }],
      });
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenCalledWith({
        where: { type: 'CURRENT', asCandidateComp: { none: {} } },
        select: { id: true, imageUrl: true },
      });
    });

    it('excludes current screenshots referenced by an active comparison job', async () => {
      mockClient.comparisonJob.findMany.mockResolvedValue([
        { candidateId: 'ss-inflight' },
        { candidateId: 'ss-inflight-2' },
      ]);
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ]);

      const result = await repository.findOrphanedCurrent();

      expect(result).toEqual({
        skipped: false,
        screenshots: [{ id: 'ss-1', imageUrl: 'http://example.com/img.png' }],
      });
      expect(mockClient.comparisonJob.findMany).toHaveBeenCalledWith({
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
        select: { candidateId: true },
      });
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenCalledWith({
        where: {
          type: 'CURRENT',
          asCandidateComp: { none: {} },
          id: { notIn: ['ss-inflight', 'ss-inflight-2'] },
        },
        select: { id: true, imageUrl: true },
      });
    });

    it('returns empty array when no orphaned currents', async () => {
      mockClient.comparisonJob.findMany.mockResolvedValue([]);
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([]);

      const result = await repository.findOrphanedCurrent();

      expect(result).toEqual({ skipped: false, screenshots: [] });
    });

    it('skips the sweep when an active job has NULL candidateId (unknown candidate)', async () => {
      mockClient.comparisonJob.findFirst.mockResolvedValue({
        id: 'legacy-job',
      });
      mockClient.comparisonJob.findMany.mockResolvedValue([]);
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ]);

      const result = await repository.findOrphanedCurrent();

      expect(result).toEqual({ skipped: true, screenshots: [] });
      expect(mockClient.comparisonJob.findFirst).toHaveBeenCalledWith({
        where: {
          status: { in: ['PENDING', 'PROCESSING'] },
          candidateId: null,
        },
        select: { id: true },
      });
      expect(mockClient.unifiedScreenshot.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOrphanedBaseline', () => {
    it('returns baselines older than default max age with no variant link', async () => {
      const screenshots = [
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ];
      mockClient.unifiedScreenshot.findMany.mockResolvedValue(screenshots);

      const result = await repository.findOrphanedBaseline();

      expect(result).toEqual([
        { id: 'ss-1', imageUrl: 'http://example.com/img.png' },
      ]);
      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenCalledWith({
        where: {
          type: 'BASELINE',
          asBaseline: { is: null },
          asBaselineComp: { none: {} },
          createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true, imageUrl: true },
      });
    });

    it('uses custom max age when provided', async () => {
      mockClient.unifiedScreenshot.findMany.mockResolvedValue([]);

      await repository.findOrphanedBaseline({ maxAgeMs: 60 * 60 * 1000 });

      expect(mockClient.unifiedScreenshot.findMany).toHaveBeenCalledWith({
        where: {
          type: 'BASELINE',
          asBaseline: { is: null },
          asBaselineComp: { none: {} },
          createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
        },
        select: { id: true, imageUrl: true },
      });
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
        24 * 60 * 60 * 1000,
      );

      expect(result).toEqual([
        'http://storage/ss-1.png',
        'http://storage/ss-2.png',
      ]);
      expect(mockClient.$queryRaw).toHaveBeenCalledTimes(1);
      const call = mockClient.$queryRaw.mock.calls[0] as unknown[];
      const sql = String(call[0]);
      expect(sql).toContain('"UnifiedScreenshot" s');
      expect(sql).toContain('"UnifiedVariant" v');
      expect(sql).toContain('"UnifiedComparison" c');
      expect(sql).toContain('RETURNING s."imageUrl"');
    });

    it('does nothing for an empty id list', async () => {
      const result = await repository.deleteBaselineOrphansByIdsReturningUrls(
        [],
        24 * 60 * 60 * 1000,
      );

      expect(result).toEqual([]);
      expect(mockClient.$queryRaw).not.toHaveBeenCalled();
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
  });
});
