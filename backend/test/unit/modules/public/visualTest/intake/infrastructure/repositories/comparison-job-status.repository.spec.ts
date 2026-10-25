import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { ComparisonJobStatusRepository } from '@public/visualTest/intake/infrastructure/repositories/comparison-job-status.repository';
import { createMock } from '@test/utils/create-mock';
import { REVIEWABLE_COMPARISON_ORDER } from '@public/visualTest/core/domain/types/visual-test.types';

describe('ComparisonJobStatusRepository', () => {
  let repository: ComparisonJobStatusRepository;
  let txCtx: Mocked<TransactionContext>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      comparisonJob: { findFirst: vi.fn() },
      unifiedComparison: { findFirst: vi.fn() },
    };
    txCtx = createMock<TransactionContext>();
    Object.defineProperty(txCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparisonJobStatusRepository,
        { provide: TransactionContext, useValue: txCtx },
      ],
    }).compile();

    repository = module.get(ComparisonJobStatusRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scopes the job lookup to the resolved test', async () => {
    const job = { id: 'job-1', testId: 'test-1' };
    mockClient.comparisonJob.findFirst.mockResolvedValue(job);

    await expect(repository.findByIdForTest('test-1', 'job-1')).resolves.toBe(
      job,
    );

    expect(mockClient.comparisonJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', testId: 'test-1' },
      select: expect.objectContaining({
        id: true,
        testId: true,
        status: true,
        candidateId: true,
        error: true,
        createdAt: true,
        completedAt: true,
      }),
    });
    expect(txCtx.assertInTransaction).not.toHaveBeenCalled();
  });

  it('reads the latest comparison of the job candidate', async () => {
    const comparison = { id: 'comparison-1' };
    mockClient.unifiedComparison.findFirst.mockResolvedValue(comparison);

    await expect(
      repository.findLatestComparisonByCandidate('test-1', 'candidate-1'),
    ).resolves.toBe(comparison);

    expect(mockClient.unifiedComparison.findFirst).toHaveBeenCalledWith({
      where: { testId: 'test-1', candidateId: 'candidate-1' },
      orderBy: REVIEWABLE_COMPARISON_ORDER,
      select: {
        id: true,
        status: true,
        mismatchPixelCount: true,
        mismatchPageCount: true,
        pageCount: true,
      },
    });
    expect(txCtx.assertInTransaction).not.toHaveBeenCalled();
  });
});
