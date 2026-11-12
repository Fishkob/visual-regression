import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { ReviewCommentRepository } from '@public/visualTest/review/infrastructure/repositories/review-comment.repository';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    reviewComment: { findMany: vi.fn() },
  };
}

describe('ReviewCommentRepository', () => {
  let repository: ReviewCommentRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;

  function comment(id: string, createdAt: string) {
    return {
      id,
      projectName: 'shop',
      branchName: null,
      testId: 'test-1',
      comparisonId: null,
      body: `body ${id}`,
      authorId: null,
      author: 'alice',
      createdAt: new Date(createdAt),
      resolvedAt: null,
      resolvedBy: null,
    };
  }

  beforeEach(async () => {
    mockClient = makeMockClient();
    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewCommentRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(ReviewCommentRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listForTest', () => {
    it('presents the newest window oldest-first so the thread keeps its chronology', async () => {
      // The bounded desc query returns newest→oldest; the caller renders a
      // thread, so the repository hands it back in posting order. The bound
      // itself (200 rows, newest first) is the query's job: `review-comments`
      // e2e reads the thread through the API, where the truncation is visible.
      const newest = comment('c-3', '2026-01-03T00:00:00Z');
      const middle = comment('c-2', '2026-01-02T00:00:00Z');
      const oldest = comment('c-1', '2026-01-01T00:00:00Z');
      mockClient.reviewComment.findMany.mockResolvedValue([
        newest,
        middle,
        oldest,
      ]);

      const rows = await repository.listForTest('test-1', { limit: 200 });

      expect(rows.map((row) => row.id)).toEqual(['c-1', 'c-2', 'c-3']);
    });

    it('pages with the (createdAt, id) pair the query sorts by', async () => {
      // The cursor is a pair: a bare id is not time-ordered, and a bare
      // timestamp would drop the tie-break between comments written in the same
      // millisecond. The filter must be exactly "sorts after the cursor" in the
      // same descending order, or a page skips or repeats a row.
      mockClient.reviewComment.findMany.mockResolvedValue([]);

      await repository.listForTest('test-1', {
        comparisonId: 'cmp-1',
        before: {
          id: 'c-2',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        limit: 50,
      });

      expect(mockClient.reviewComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            testId: 'test-1',
            comparisonId: 'cmp-1',
            OR: [
              { createdAt: { lt: new Date('2026-01-02T00:00:00.000Z') } },
              {
                createdAt: new Date('2026-01-02T00:00:00.000Z'),
                id: { lt: 'c-2' },
              },
            ],
          }),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        }),
      );
    });
  });
});
