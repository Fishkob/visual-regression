import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import {
  ApprovalAuditRepository,
  DEFAULT_APPROVAL_HISTORY_LIMIT,
  MAX_APPROVAL_HISTORY_LIMIT,
  type ApprovalAuditEntry,
} from '@public/visualTest/core/infrastructure/repositories/approval-audit.repository';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    approval: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

describe('ApprovalAuditRepository', () => {
  let repository: ApprovalAuditRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;
  const approvedAt = new Date('2025-01-01T00:00:00Z');

  beforeEach(async () => {
    mockClient = makeMockClient();

    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalAuditRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(ApprovalAuditRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function entry(overrides: Partial<ApprovalAuditEntry> = {}) {
    return {
      projectName: 'checkout-ui',
      testName: 'login-form',
      branchName: null,
      testId: 'test-1',
      testKind: 'image',
      variantViewport: '1920x1080',
      variantBrowser: 'Chrome',
      variantEnvironment: 'staging',
      comparisonId: 'comp-1',
      baselineId: 'baseline-1',
      candidateId: 'candidate-1',
      candidateHash: 'new-hash',
      baselineHash: 'old-hash',
      mismatchPixelCount: 42,
      mismatchPageCount: null,
      pageCount: null,
      approvedBy: 'jane.doe',
      ...overrides,
    } as ApprovalAuditEntry;
  }

  describe('record', () => {
    it('creates the audit row through the transaction client', async () => {
      mockClient.approval.create.mockResolvedValue({ id: 'approval-1' });
      const auditEntry = entry();

      await repository.record(auditEntry);

      expect(mockClient.approval.create).toHaveBeenCalledWith({
        data: auditEntry,
      });
    });

    it('refuses to write outside a state-change transaction', async () => {
      mockTxCtx.assertInTransaction.mockImplementation(() => {
        throw new Error('no active transaction');
      });

      await expect(repository.record(entry())).rejects.toThrow(
        'no active transaction',
      );
      expect(mockTxCtx.assertInTransaction).toHaveBeenCalled();
      expect(mockClient.approval.create).not.toHaveBeenCalled();
    });
  });

  describe('findForTest', () => {
    it('reads the newest approvals of a test on a branch', async () => {
      const rows = [{ id: 'approval-1', approvedAt }];
      mockClient.approval.findMany.mockResolvedValue(rows);

      const result = await repository.findForTest({
        projectName: 'checkout-ui',
        testName: 'login-form',
        branchName: 'feature/x',
      });

      expect(mockClient.approval.findMany).toHaveBeenCalledWith({
        where: {
          projectName: 'checkout-ui',
          testName: 'login-form',
          branchName: 'feature/x',
        },
        orderBy: { approvedAt: 'desc' },
        take: DEFAULT_APPROVAL_HISTORY_LIMIT,
      });
      expect(result).toBe(rows);
    });

    it('does not constrain the branch when the caller omits one', async () => {
      mockClient.approval.findMany.mockResolvedValue([]);

      await repository.findForTest({
        projectName: 'checkout-ui',
        testName: 'login-form',
      });

      expect(mockClient.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectName: 'checkout-ui',
            testName: 'login-form',
          },
        }),
      );
    });

    it('caps the requested page size at the hard maximum', async () => {
      mockClient.approval.findMany.mockResolvedValue([]);

      await repository.findForTest({
        projectName: 'checkout-ui',
        testName: 'login-form',
        take: MAX_APPROVAL_HISTORY_LIMIT + 500,
      });

      expect(mockClient.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: MAX_APPROVAL_HISTORY_LIMIT }),
      );
    });

    it('honours a smaller requested page size', async () => {
      mockClient.approval.findMany.mockResolvedValue([]);

      await repository.findForTest({
        projectName: 'checkout-ui',
        testName: 'login-form',
        take: 5,
      });

      expect(mockClient.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });
});
