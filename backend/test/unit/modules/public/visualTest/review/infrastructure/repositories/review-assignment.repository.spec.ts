import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { ReviewAssignmentRepository } from '@public/visualTest/review/infrastructure/repositories/review-assignment.repository';
import { ALL_PROJECTS } from '@common/domain/project-scope';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return { reviewAssignment: { findMany: vi.fn().mockResolvedValue([]) } };
}

// Policy, not mechanism (ADR-059): a reviewer's work list must not name projects
// it cannot open.
describe('ReviewAssignmentRepository', () => {
  let repository: ReviewAssignmentRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewAssignmentRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(ReviewAssignmentRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters my open assignments to the projects I may see', async () => {
    await repository.listForAssignee('u-1', false, {
      kind: 'ids',
      ids: new Set(['p-1', 'p-shared']),
    });

    expect(mockClient.reviewAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assigneeId: 'u-1',
          completedAt: null,
          projectId: { in: ['p-1', 'p-shared'] },
        },
      }),
    );
  });

  it('leaves the query unfiltered for an unrestricted caller', async () => {
    await repository.listForAssignee('u-1', true, ALL_PROJECTS);

    expect(mockClient.reviewAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assigneeId: 'u-1' } }),
    );
  });

  it('filters the overdue list the same way', async () => {
    const now = new Date('2026-10-20T10:00:00Z');

    await repository.overdue('u-1', now, {
      kind: 'ids',
      ids: new Set(['p-1']),
    });

    expect(mockClient.reviewAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assigneeId: 'u-1',
          completedAt: null,
          dueAt: { lt: now },
          projectId: { in: ['p-1'] },
        },
      }),
    );
  });
});
