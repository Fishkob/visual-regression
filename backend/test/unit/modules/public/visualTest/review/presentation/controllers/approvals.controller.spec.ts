import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalsController } from '@public/visualTest/review/presentation/controllers/approvals.controller';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { ApproveComparisonBodyDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';
import { createMock } from '@test/utils/create-mock';

describe('ApprovalsController', () => {
  let controller: ApprovalsController;
  let approvals: Mocked<ApprovalService>;

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

  describe('approveVisualTest', () => {
    it('approves the pinned comparison for the project and test', async () => {
      approvals.approveImage.mockResolvedValue({
        approved: true,
        newBaselineUrl: 'https://example.com/baseline.png',
      });

      const result = await controller.approveVisualTest(
        'checkout-ui',
        'login-form',
        {
          comparisonId: 'comp-1',
        },
      );

      expect(approvals.approveImage).toHaveBeenCalledWith(
        'checkout-ui',
        'login-form',
        'comp-1',
      );
      expect(result).toEqual({
        approved: true,
        newBaselineUrl: 'https://example.com/baseline.png',
      });
    });
  });

  describe('approvePdfTest', () => {
    it('approves the pinned pdf comparison with the body params', async () => {
      approvals.approvePdf.mockResolvedValue({
        approved: true,
        newBaselineUrl: 'https://example.com/baseline.pdf',
      });
      const body: ApproveComparisonBodyDto = {
        comparisonId: 'pdf-comp-1',
      };

      const result = await controller.approvePdfTest(
        'checkout-ui',
        'login-form',
        body,
      );

      expect(approvals.approvePdf).toHaveBeenCalledWith(
        'checkout-ui',
        'login-form',
        'pdf-comp-1',
      );
      expect(result).toEqual({
        approved: true,
        newBaselineUrl: 'https://example.com/baseline.pdf',
      });
    });
  });
});
