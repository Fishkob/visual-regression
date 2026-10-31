import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { ProjectShareLinkRepository } from '@public/visualTest/core/infrastructure/repositories/project-share-link.repository';
import { createMock } from '@test/utils/create-mock';

describe('ProjectShareLinkRepository', () => {
  let repository: ProjectShareLinkRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = { shareLink: { deleteMany: vi.fn() } };

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectShareLinkRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(ProjectShareLinkRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes the links of a deleted project by name', async () => {
    mockClient.shareLink.deleteMany.mockResolvedValue({ count: 2 });

    await repository.deleteForProjectName('acme');

    expect(mockClient.shareLink.deleteMany).toHaveBeenCalledWith({
      where: { projectName: 'acme' },
    });
  });

  it('requires the ambient transaction of the project deletion', async () => {
    mockTxCtx.assertInTransaction.mockImplementation(() => {
      throw new Error('no transaction');
    });

    await expect(repository.deleteForProjectName('acme')).rejects.toThrow(
      'no transaction',
    );
    expect(mockClient.shareLink.deleteMany).not.toHaveBeenCalled();
  });
});
