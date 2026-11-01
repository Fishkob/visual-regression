import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { ReviewArtifactRepository } from '@public/visualTest/core/infrastructure/repositories/review-artifact.repository';
import { createMock } from '@test/utils/create-mock';

describe('ReviewArtifactRepository', () => {
  let repository: ReviewArtifactRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      reviewComment: { deleteMany: vi.fn() },
      approvalVote: { deleteMany: vi.fn() },
    };

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewArtifactRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(ReviewArtifactRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deleteForTestIds', () => {
    it('deletes the comments that name a deleted test', async () => {
      mockClient.reviewComment.deleteMany.mockResolvedValue({ count: 2 });

      await repository.deleteForTestIds(['test-1', 'test-2']);

      expect(mockClient.reviewComment.deleteMany).toHaveBeenCalledWith({
        where: { testId: { in: ['test-1', 'test-2'] } },
      });
    });

    it('keeps the approval votes as the durable 4-eyes trail', async () => {
      mockClient.reviewComment.deleteMany.mockResolvedValue({ count: 0 });

      await repository.deleteForTestIds(['test-1']);

      expect(mockClient.approvalVote.deleteMany).not.toHaveBeenCalled();
    });

    it('does not touch the tables for an empty test list', async () => {
      await repository.deleteForTestIds([]);

      expect(mockClient.reviewComment.deleteMany).not.toHaveBeenCalled();
      expect(mockClient.approvalVote.deleteMany).not.toHaveBeenCalled();
    });

    it('requires an ambient transaction so the cleanup rides the delete', async () => {
      mockTxCtx.assertInTransaction.mockImplementation(() => {
        throw new Error('Operation requires an active transaction');
      });

      await expect(repository.deleteForTestIds(['test-1'])).rejects.toThrow(
        'requires an active transaction',
      );
      expect(mockClient.reviewComment.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteForProjectName', () => {
    it('deletes the project-scoped comment rows', async () => {
      mockClient.reviewComment.deleteMany.mockResolvedValue({ count: 0 });

      await repository.deleteForProjectName('shop');

      expect(mockClient.reviewComment.deleteMany).toHaveBeenCalledWith({
        where: { projectName: 'shop' },
      });
    });

    it('keeps the project-scoped approval votes', async () => {
      mockClient.reviewComment.deleteMany.mockResolvedValue({ count: 0 });

      await repository.deleteForProjectName('shop');

      expect(mockClient.approvalVote.deleteMany).not.toHaveBeenCalled();
    });
  });
});
