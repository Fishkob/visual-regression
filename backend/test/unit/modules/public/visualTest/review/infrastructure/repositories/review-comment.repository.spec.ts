import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { ReviewCommentRepository } from '@public/visualTest/review/infrastructure/repositories/review-comment.repository';
import { createMock } from '@test/utils/create-mock';

describe('ReviewCommentRepository', () => {
  let repository: ReviewCommentRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: any;

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
    mockClient = {
      reviewComment: { findMany: vi.fn() },
    };
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
    it('queries the newest 200 comments', async () => {
      mockClient.reviewComment.findMany.mockResolvedValue([]);

      await repository.listForTest('test-1');

      expect(mockClient.reviewComment.findMany).toHaveBeenCalledWith({
        where: { testId: 'test-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
    });

    it('presents the newest window oldest-first so the thread keeps its chronology', async () => {
      // The bounded desc query returns newest→oldest; the caller renders a
      // thread, so the repository hands it back in posting order.
      const newest = comment('c-3', '2026-01-03T00:00:00Z');
      const middle = comment('c-2', '2026-01-02T00:00:00Z');
      const oldest = comment('c-1', '2026-01-01T00:00:00Z');
      mockClient.reviewComment.findMany.mockResolvedValue([
        newest,
        middle,
        oldest,
      ]);

      const rows = await repository.listForTest('test-1');

      expect(rows.map((row) => row.id)).toEqual(['c-1', 'c-2', 'c-3']);
    });

    it('narrows the window to one comparison when asked', async () => {
      mockClient.reviewComment.findMany.mockResolvedValue([]);

      await repository.listForTest('test-1', 'cmp-1');

      expect(mockClient.reviewComment.findMany).toHaveBeenCalledWith({
        where: { testId: 'test-1', comparisonId: 'cmp-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
    });
  });
});
