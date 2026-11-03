import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import {
  ComparisonOutcomeRepository,
  type ComparisonOutcomeEntry,
} from '@public/visualTest/core/infrastructure/repositories/comparison-outcome.repository';
import { createMock } from '@test/utils/create-mock';
import { sqlText, sqlValues } from '@test/utils/raw-sql';

describe('ComparisonOutcomeRepository', () => {
  let repository: ComparisonOutcomeRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: any;

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
    mockClient = {
      comparisonOutcomeEvent: { create: vi.fn(), findMany: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

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
    it('counts the daily outcomes by the denormalized project name', async () => {
      await repository.trends('shop', since);

      const sql = sqlText(statement('date_trunc'));
      expect(sql).toContain('FROM "ComparisonOutcomeEvent" e');
      expect(sql).toContain('e."projectName" = ?');
      // A join would drop the history of a test that has since been deleted.
      expect(sql).not.toContain('"UnifiedTest"');
      expect(sql).not.toContain('"Branch"');
      expect(sql).not.toContain('"Project"');
      expect(sqlValues(statement('date_trunc'))).toEqual(['shop', since]);
    });

    it('computes the flake rate without joining the live test tree', async () => {
      await repository.trends('shop', since);

      const sql = sqlText(statement('per_test'));
      expect(sql).toContain('FROM "ComparisonOutcomeEvent" e');
      expect(sql).toContain('e."projectName" = ?');
      expect(sql).not.toContain('"UnifiedTest"');
      expect(sql).not.toContain('"Branch"');
      expect(sql).not.toContain('"Project"');
      expect(sqlValues(statement('per_test'))).toEqual(['shop', since]);
    });

    it('keeps reading the pending-review queue from the live comparison tree', async () => {
      await repository.trends('shop', since);

      const sql = sqlText(statement('PENDING_APPROVAL'));
      expect(sql).toContain('FROM "UnifiedComparison" c');
      expect(sql).toContain('"UnifiedTest"');
      expect(sql).toContain('p.name = ?');
    });

    it('keeps reading approval latency from the durable Approval rows', async () => {
      await repository.trends('shop', since);

      const sql = sqlText(statement('"Approval" a'));
      expect(sql).toContain('a."projectName" = ?');
    });
  });
});
