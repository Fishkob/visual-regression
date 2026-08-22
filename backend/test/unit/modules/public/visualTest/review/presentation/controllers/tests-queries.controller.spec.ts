import { Test, TestingModule } from '@nestjs/testing';
import { TestsQueriesController } from '@public/visualTest/review/presentation/controllers/tests-queries.controller';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import { DomainError } from '@common/domain/domain-error';
import { PaginationDto } from '@common/dto/pagination.dto';
import { VariantFilterDto } from '@public/visualTest/review/presentation/dto/variant.dto';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonStatus,
  ScreenshotType,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';
describe('TestsQueriesController', () => {
  let controller: TestsQueriesController;
  let testQuery: jest.Mocked<TestQueryService>;

  beforeEach(async () => {
    testQuery = createMock<TestQueryService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestsQueriesController],
      providers: [
        { provide: TestQueryService, useValue: testQuery },
        { provide: AppLoggerService, useValue: createMockLogger() },
      ],
    }).compile();

    controller = module.get(TestsQueriesController);
  });

  describe('getTestsForProject', () => {
    it('filters tests by kind', async () => {
      testQuery.getTestNames.mockResolvedValue({
        data: [{ name: 'report.pdf' }, { name: 'form.pdf' }],
        meta: {
          total: 2,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      } as any);

      const result = await controller.getTestsForProject(
        'checkout-ui',
        'pdf',
        new PaginationDto(),
      );

      expect(result).toMatchObject({
        data: [{ name: 'report.pdf' }, { name: 'form.pdf' }],
      });
      expect(testQuery.getTestNames).toHaveBeenCalledWith(
        'checkout-ui',
        expect.any(PaginationDto),
        'pdf',
      );
    });

    it('returns paginated test names', async () => {
      testQuery.getTestNames.mockResolvedValue({
        data: [{ name: 'login-form' }],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      } as any);

      const result = await controller.getTestsForProject(
        'checkout-ui',
        undefined,
        new PaginationDto(),
      );

      expect(result).toMatchObject({ data: [{ name: 'login-form' }] });
      expect(testQuery.getTestNames).toHaveBeenCalledWith(
        'checkout-ui',
        expect.any(PaginationDto),
        undefined,
      );
    });
  });

  const mockVariant = Variant.fromStrings('1920x1080', 'Chrome', 'ci');
  const mockBaseline = new ScreenshotEntity({
    id: 'ss-1',
    visualTestId: 'test-1',
    type: ScreenshotType.BASELINE,
    imageHash: 'abc',
    imageUrl: 'https://example.com/baseline.png',
    variant: mockVariant,
    createdAt: new Date(),
    pixelDiffThreshold: 0,
  });
  const mockComparison = new ComparisonEntity({
    id: 'cmp-1',
    visualTestId: 'test-1',
    mismatchPixelCount: 42,
    diffImageUrl: 'https://example.com/diff.png',
    status: ComparisonStatus.PENDING_APPROVAL,
    baselineId: 'ss-1',
    candidateId: 'ss-candidate',
    createdAt: new Date(),
    baseline: mockBaseline,
  });

  describe('getVisualTestDetails', () => {
    it('returns test details with baseline and comparison', async () => {
      testQuery.getVisualTestDetails.mockResolvedValue({
        name: 'login-form',
        baseline: mockBaseline,
        comparison: mockComparison,
      } as any);

      const result = await controller.getVisualTestDetails(
        'checkout-ui',
        'login-form',
        new VariantFilterDto(),
      );

      expect(result).toMatchObject({
        name: 'login-form',
        baseline: expect.objectContaining({ id: 'ss-1' }),
      });
    });

    it('returns test details without comparison', async () => {
      testQuery.getVisualTestDetails.mockResolvedValue({
        name: 'login-form',
        baseline: mockBaseline,
        comparison: undefined,
      } as any);

      const result = await controller.getVisualTestDetails(
        'checkout-ui',
        'login-form',
        new VariantFilterDto(),
      );

      expect(result.comparison).toBeUndefined();
    });

    it('throws not found when no baseline exists', async () => {
      testQuery.getVisualTestDetails.mockRejectedValue(
        new DomainError('Visual test "nonexistent" not found', 'NOT_FOUND'),
      );

      await expect(
        controller.getVisualTestDetails(
          'checkout-ui',
          'nonexistent',
          new VariantFilterDto(),
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('getTestsWithPendingStatus', () => {
    it('returns paginated pending tests for a project', async () => {
      testQuery.getTestsWithPendingStatus.mockResolvedValue({
        data: [
          {
            name: 'login-form',
            viewport: '1920x1080',
            browser: 'Chrome',
            environment: 'ci',
            latestStatus: 'PENDING_APPROVAL',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      } as any);

      const pagination = new PaginationDto();
      const result = await controller.getTestsWithPendingStatus(
        'checkout-ui',
        pagination,
      );

      expect(result).toMatchObject({
        data: [expect.objectContaining({ name: 'login-form' })],
        meta: expect.objectContaining({ total: 1 }),
      });
      expect(testQuery.getTestsWithPendingStatus).toHaveBeenCalledWith(
        'checkout-ui',
        pagination,
      );
    });

    it('throws not found when project does not exist', async () => {
      testQuery.getTestsWithPendingStatus.mockRejectedValue(
        new DomainError('Project "nonexistent" not found', 'NOT_FOUND'),
      );

      const pagination = new PaginationDto();
      await expect(
        controller.getTestsWithPendingStatus('nonexistent', pagination),
      ).rejects.toThrow(DomainError);
    });
  });
});
