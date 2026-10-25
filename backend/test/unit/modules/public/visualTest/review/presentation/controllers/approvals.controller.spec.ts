import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ApprovalsController } from '@public/visualTest/review/presentation/controllers/approvals.controller';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { ApproveComparisonBodyDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';
import type { ApprovalAuditRecord } from '@public/visualTest/core/infrastructure/repositories/approval-audit.repository';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { createMock } from '@test/utils/create-mock';

describe('ApprovalsController', () => {
  let controller: ApprovalsController;
  let approvals: Mocked<ApprovalService>;

  const req = { auth: { username: 'jane.doe' } } as AuthenticatedRequest;

  beforeEach(async () => {
    approvals = createMock<ApprovalService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprovalsController],
      providers: [{ provide: ApprovalService, useValue: approvals }],
    }).compile();

    controller = module.get(ApprovalsController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function auditRecord(overrides: Partial<ApprovalAuditRecord> = {}) {
    return {
      id: 'approval-1',
      projectName: 'checkout-ui',
      testName: 'login-form',
      branchName: 'feature/x',
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
      approvedAt: new Date('2025-01-01T00:00:00Z'),
      ...overrides,
    } as ApprovalAuditRecord;
  }

  describe('approveVisualTest', () => {
    it('approves the pinned comparison for the project and test as the caller', async () => {
      approvals.approveImage.mockResolvedValue({
        approved: true,
        newBaselineUrl: 'https://example.com/baseline.png',
        signedNewBaselineUrl: 'https://example.com/baseline.png?sig',
      });

      const result = await controller.approveVisualTest(
        'checkout-ui',
        'login-form',
        {
          comparisonId: 'comp-1',
        },
        req,
      );

      expect(approvals.approveImage).toHaveBeenCalledWith(
        'checkout-ui',
        'login-form',
        'comp-1',
        'jane.doe',
        undefined,
      );
      expect(result).toEqual({
        approved: true,
        newBaselineUrl: 'https://example.com/baseline.png',
        signedNewBaselineUrl: 'https://example.com/baseline.png?sig',
      });
    });

    it('rejects the approval when the request carries no authenticated principal', async () => {
      await expect(
        controller.approveVisualTest(
          'checkout-ui',
          'login-form',
          { comparisonId: 'comp-1' },
          {} as AuthenticatedRequest,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(approvals.approveImage).not.toHaveBeenCalled();
    });
  });

  describe('approvePdfTest', () => {
    it('approves the pinned pdf comparison with the body params as the caller', async () => {
      approvals.approvePdf.mockResolvedValue({
        approved: true,
        newBaselineUrl: 'https://example.com/baseline.pdf',
        signedNewBaselineUrl: 'https://example.com/baseline.pdf?sig',
      });
      const body: ApproveComparisonBodyDto = {
        comparisonId: 'pdf-comp-1',
      };

      const result = await controller.approvePdfTest(
        'checkout-ui',
        'login-form',
        body,
        req,
        'feature/x',
      );

      expect(approvals.approvePdf).toHaveBeenCalledWith(
        'checkout-ui',
        'login-form',
        'pdf-comp-1',
        'jane.doe',
        'feature/x',
      );
      expect(result).toEqual({
        approved: true,
        newBaselineUrl: 'https://example.com/baseline.pdf',
        signedNewBaselineUrl: 'https://example.com/baseline.pdf?sig',
      });
    });

    it('rejects the approval when the request carries no authenticated principal', async () => {
      await expect(
        controller.approvePdfTest(
          'checkout-ui',
          'login-form',
          { comparisonId: 'pdf-comp-1' },
          {} as AuthenticatedRequest,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(approvals.approvePdf).not.toHaveBeenCalled();
    });
  });

  describe('listApprovals', () => {
    it('maps the audit rows to the approval DTO shape without leaking columns', async () => {
      approvals.listApprovals.mockResolvedValue([auditRecord()]);

      const result = await controller.listApprovals(
        'checkout-ui',
        'login-form',
        'feature/x',
      );

      expect(approvals.listApprovals).toHaveBeenCalledWith(
        'checkout-ui',
        'login-form',
        'feature/x',
      );
      expect(result).toEqual([
        {
          id: 'approval-1',
          approvedBy: 'jane.doe',
          approvedAt: new Date('2025-01-01T00:00:00Z'),
          comparisonId: 'comp-1',
          testKind: 'image',
          branchName: 'feature/x',
          variant: {
            viewport: '1920x1080',
            browser: 'Chrome',
            environment: 'staging',
          },
          candidateHash: 'new-hash',
          baselineHash: 'old-hash',
          mismatchPixelCount: 42,
          mismatchPageCount: null,
          pageCount: null,
        },
      ]);
      expect(result[0]).not.toHaveProperty('projectName');
      expect(result[0]).not.toHaveProperty('testId');
      expect(result[0]).not.toHaveProperty('variantViewport');
    });
  });
});
