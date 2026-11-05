import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import {
  ComparisonOutcomeRepository,
  type ComparisonOutcomeEntry,
} from '@public/visualTest/core/infrastructure/repositories/comparison-outcome.repository';
import { createMock } from '@test/utils/create-mock';
import { sqlText, sqlValues } from '@test/utils/raw-sql';

function makeMockClient() {
  return {
    comparisonOutcomeEvent: { create: vi.fn(), findMany: vi.fn() },
    approval: { groupBy: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

describe('ComparisonOutcomeRepository', () => {
  let repository: ComparisonOutcomeRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;

  const since = new Date('2026-01-01T00:00:00Z');

  const entry: ComparisonOutcomeEntry = {
    projectName: 'shop',
    testId: 'test-1',
    testName: 'checkout',
    kind: 'image',
    viewport: '1920x1080',
    browser: 'chrome',
    environment: 'staging',
    outcome: 'changed',
    mismatchMetric: 12,
  };

  function statement(needle: string): unknown[] {
    const call = mockClient.$queryRaw.mock.calls.find((candidate: unknown[]) =>
      sqlText(candidate).includes(needle),
    );
    if (!call) throw new Error(`no statement containing ${needle}`);
    return call as unknown[];
  }

  beforeEach(async () => {
    mockClient = makeMockClient();

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparisonOutcomeRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(ComparisonOutcomeRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('record', () => {
    it('denormalizes the project name onto the retained row', async () => {
      await repository.record(entry);

      expect(mockClient.comparisonOutcomeEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectName: 'shop',
          testId: 'test-1',
          outcome: 'changed',
        }),
      });
    });
  });

  describe('eventsForTest', () => {
    it('still selects by testId so a live test keeps its own history', async () => {
      mockClient.comparisonOutcomeEvent.findMany.mockResolvedValue([]);

      await repository.eventsForTest('test-1', since);

      expect(mockClient.comparisonOutcomeEvent.findMany).toHaveBeenCalledWith({
        where: { testId: 'test-1', createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: { outcome: true, createdAt: true },
      });
    });
  });

  describe('trends', () => {
    it('counts the daily outcomes by the denormalized project id', async () => {
      await repository.trends('p-shop', since);

      const sql = sqlText(statement('date_trunc'));
      expect(sql).toContain('FROM "ComparisonOutcomeEvent" e');
      expect(sql).toContain('e."projectId" = ?');
      // A join would drop the history of a test that has since been deleted.
      expect(sql).not.toContain('"UnifiedTest"');
      expect(sql).not.toContain('"Branch"');
      expect(sql).not.toContain('"Project"');
      expect(sqlValues(statement('date_trunc'))).toEqual(['p-shop', since]);
    });

    it('computes the flake rate without joining the live test tree', async () => {
      await repository.trends('p-shop', since);

      const sql = sqlText(statement('per_test'));
      expect(sql).toContain('FROM "ComparisonOutcomeEvent" e');
      expect(sql).toContain('e."projectId" = ?');
      expect(sql).not.toContain('"UnifiedTest"');
      expect(sql).not.toContain('"Branch"');
      expect(sql).not.toContain('"Project"');
      expect(sqlValues(statement('per_test'))).toEqual(['p-shop', since]);
    });

    it('keeps reading the pending-review queue from the live comparison tree', async () => {
      await repository.trends('p-shop', since);

      const sql = sqlText(statement('PENDING_APPROVAL'));
      expect(sql).toContain('FROM "UnifiedComparison" c');
      expect(sql).toContain('"UnifiedTest"');
      expect(sql).toContain('p.id = ?');
    });

    it('keeps reading approval latency from the durable Approval rows', async () => {
      await repository.trends('p-shop', since);

      const sql = sqlText(statement('"Approval" a'));
      expect(sql).toContain('a."projectId" = ?');
    });

    it('counts the approval reasons by project and window', async () => {
      mockClient.approval.groupBy.mockResolvedValue([
        { reason: 'INTENDED_CHANGE', _count: { _all: 6 } },
        { reason: 'FLAKE', _count: { _all: 2 } },
        { reason: 'INFRA', _count: { _all: 1 } },
        { reason: null, _count: { _all: 3 } },
      ]);

      const trends = await repository.trends('p-shop', since);

      expect(mockClient.approval.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['reason'],
          where: { projectId: 'p-shop', approvedAt: { gte: since } },
        }),
      );
      expect(trends.reviewReasons).toEqual({
        intendedChange: 6,
        flake: 2,
        infra: 1,
        noReason: 3,
        withReason: 9,
        knownNoise: 3,
        knownNoiseRate: 3 / 9,
      });
    });

    it('reports no noise share when only reason-less approvals exist', async () => {
      mockClient.approval.groupBy.mockResolvedValue([
        { reason: null, _count: { _all: 4 } },
      ]);

      const trends = await repository.trends('p-shop', since);

      expect(trends.reviewReasons).toEqual({
        intendedChange: 0,
        flake: 0,
        infra: 0,
        noReason: 4,
        withReason: 0,
        knownNoise: 0,
        knownNoiseRate: 0,
      });
    });
  });
});
