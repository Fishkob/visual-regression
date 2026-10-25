import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { DomainError } from '@common/domain/domain-error';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonStatus,
  ScreenshotType,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { createMock } from '@test/utils/create-mock';
import { createMockStorage } from '@test/utils/mocks';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';

describe('TestQueryService', () => {
  let service: TestQueryService;
  let reviewRead: Mocked<TestReadRepository>;
  let testResolver: Mocked<TestResolver>;
  let branches: Mocked<BranchResolver>;
  let storage: Mocked<IStorageProvider>;

  const variant = Variant.fromStrings('1920x1080', 'chrome', 'staging');

  function makeScreenshot(overrides: Record<string, unknown> = {}) {
    return new ScreenshotEntity({
      id: 'baseline-1',
      visualTestId: 'test-1',
      type: ScreenshotType.BASELINE,
      imageHash: 'hash',
      imageUrl: 'http://storage/baseline.png',
      variant,
      createdAt: new Date('2024-01-01'),
      pixelDiffThreshold: 0,
      ...overrides,
    });
  }

  function makeComparison(overrides: Record<string, unknown> = {}) {
    return new ComparisonEntity({
      id: 'cmp-1',
      visualTestId: 'test-1',
      mismatchPixelCount: 10,
      diffImageUrl: 'http://storage/diff.png',
      status: ComparisonStatus.PENDING_APPROVAL,
      baselineId: 'baseline-1',
      candidateId: 'candidate-1',
      createdAt: new Date('2024-01-02'),
      ...overrides,
    });
  }

  beforeEach(async () => {
    reviewRead = createMock<TestReadRepository>();
    testResolver = createMock<TestResolver>();
    branches = createMock<BranchResolver>();
    storage = createMockStorage() as unknown as Mocked<IStorageProvider>;
    branches.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-1',
      branchName: 'main',
      isDefault: true,
      isArchived: false,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestQueryService,
        { provide: TestReadRepository, useValue: reviewRead },
        { provide: TestResolver, useValue: testResolver },
        { provide: BranchResolver, useValue: branches },
        { provide: STORAGE_PROVIDER, useValue: storage },
      ],
    }).compile();

    service = module.get(TestQueryService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTestNames', () => {
    it('resolves the project and delegates to the repository by project id', async () => {
      reviewRead.getTestNames.mockResolvedValue({
        data: [
          {
            name: 'a',
            kind: 'image',
            status: 'PENDING',
            origin: 'branch',
            inheritedFrom: null,
          },
          {
            name: 'b',
            kind: 'pdf',
            status: null,
            origin: 'inherited',
            inheritedFrom: 'main',
          },
        ],
        total: 2,
      });

      const result = await service.getTestNames('proj', {} as any, 'image');

      expect(branches.resolveRead).toHaveBeenCalledWith('proj', undefined);
      expect(reviewRead.getTestNames).toHaveBeenCalledWith(
        'br-1',
        expect.anything(),
        'image',
      );
      expect(result.data).toEqual([
        {
          name: 'a',
          kind: 'image',
          status: 'PENDING',
          origin: 'branch',
          inheritedFrom: null,
        },
        {
          name: 'b',
          kind: 'pdf',
          status: null,
          origin: 'inherited',
          inheritedFrom: 'main',
        },
      ]);
    });

    it('rejects an invalid kind filter instead of silently returning empty', async () => {
      await expect(
        service.getTestNames('proj', {} as any, 'nonsense'),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(reviewRead.getTestNames).not.toHaveBeenCalled();
    });
  });

  describe('getKind', () => {
    it('returns kind of resolved test', async () => {
      testResolver.findTest.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'pdf',
      } as any);

      const result = await service.getKind('proj', 'my-test');

      expect(result).toEqual({ kind: 'pdf' });
    });
  });

  describe('getTestsWithPendingStatus', () => {
    it('returns paginated pending approvals for project', async () => {
      reviewRead.getPendingApproval.mockResolvedValue({
        data: [
          {
            name: 'a',
            variant: {
              viewport: '1920x1080',
              browser: 'chrome',
              environment: 'staging',
            },
            latestStatus: 'PENDING_APPROVAL',
          },
        ],
        total: 1,
      });

      const result = await service.getTestsWithPendingStatus('proj', {} as any);

      expect(reviewRead.getPendingApproval).toHaveBeenCalledWith(
        'br-1',
        expect.anything(),
        undefined,
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getVisualTestDetails', () => {
    it('returns test details mapped to DTOs', async () => {
      const baseline = makeScreenshot();
      const comparison = makeComparison({
        baseline,
        candidate: makeScreenshot({
          id: 'candidate-1',
          type: ScreenshotType.CURRENT,
        }),
      });
      reviewRead.findVisualTestDetails.mockResolvedValue({
        exists: true,
        kind: 'image',
        origin: 'branch',
        inheritedFrom: null,
        baselineInherited: false,
        inheritTarget: null,
        baseline,
        comparison,
      });

      const result = await service.getVisualTestDetails(
        'my-project',
        'my-test',
        { viewport: '1920x1080' },
      );

      expect(reviewRead.findVisualTestDetails).toHaveBeenCalledWith(
        'my-project',
        'my-test',
        { viewport: '1920x1080' },
        undefined,
      );
      expect(result).toEqual({
        name: 'my-test',
        origin: 'branch',
        inheritedFrom: null,
        baselineInherited: false,
        inheritTarget: null,
        baseline: expect.objectContaining({ id: 'baseline-1' }),
        comparison: expect.objectContaining({
          id: 'cmp-1',
          status: ComparisonStatus.PENDING_APPROVAL,
          thresholdExceeded: true,
        }),
      });
    });

    it('returns undefined comparison when none exists', async () => {
      reviewRead.findVisualTestDetails.mockResolvedValue({
        exists: true,
        kind: 'image',
        origin: 'branch',
        inheritedFrom: null,
        baselineInherited: false,
        inheritTarget: null,
        baseline: makeScreenshot(),
        comparison: null,
      });

      const result = await service.getVisualTestDetails(
        'my-project',
        'my-test',
        { viewport: '1920x1080' },
      );

      expect(result.comparison).toBeUndefined();
    });

    it('throws DomainError when the test does not exist', async () => {
      reviewRead.findVisualTestDetails.mockResolvedValue({
        exists: false,
        baseline: null,
        comparison: null,
      });

      await expect(
        service.getVisualTestDetails('my-project', 'unknown-test', {
          viewport: '1920x1080',
        }),
      ).rejects.toThrow(DomainError);
    });

    it('returns details without baseline when the test exists but has no baseline yet', async () => {
      reviewRead.findVisualTestDetails.mockResolvedValue({
        exists: true,
        kind: 'image',
        origin: 'branch',
        inheritedFrom: null,
        baselineInherited: false,
        inheritTarget: null,
        baseline: null,
        comparison: null,
      });

      const result = await service.getVisualTestDetails(
        'my-project',
        'my-test',
        { viewport: '1920x1080' },
      );

      expect(result).toEqual({
        name: 'my-test',
        origin: 'branch',
        inheritedFrom: null,
        baselineInherited: false,
        inheritTarget: null,
      });
    });

    it('rejects an empty variant filter instead of picking an arbitrary variant', async () => {
      await expect(
        service.getVisualTestDetails('my-project', 'my-test', {}),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Variant filters (viewport/browser/environment) are required',
      });
      expect(reviewRead.findVisualTestDetails).not.toHaveBeenCalled();
    });

    it('rejects an empty-string variant filter instead of picking an arbitrary variant', async () => {
      await expect(
        service.getVisualTestDetails('my-project', 'my-test', {
          viewport: '',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Variant filter "viewport" must be a non-empty string',
      });
      expect(reviewRead.findVisualTestDetails).not.toHaveBeenCalled();
    });

    it('rejects a PDF test served through the image read model', async () => {
      reviewRead.findVisualTestDetails.mockResolvedValue({
        exists: true,
        kind: 'pdf',
        origin: 'branch',
        inheritedFrom: null,
        baselineInherited: false,
        inheritTarget: null,
        baseline: makeScreenshot(),
        comparison: makeComparison({}),
      });
      testResolver.assertTestKind.mockImplementation(() => {
        throw new DomainError(
          'Test "my-test" is not an image test',
          'BAD_REQUEST',
        );
      });

      await expect(
        service.getVisualTestDetails('my-project', 'my-test', {
          viewport: '1920x1080',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Test "my-test" is not an image test',
      });
      expect(testResolver.assertTestKind).toHaveBeenCalledWith(
        { name: 'my-test', kind: 'pdf' },
        'image',
      );
    });
  });

  describe('getTestVariants', () => {
    function variantRow(overrides: Record<string, unknown> = {}) {
      return {
        viewport: '1920x1080',
        browser: 'chrome',
        environment: 'staging',
        baselineUrl: 'http://storage/baseline.png',
        isInherited: false,
        latestComparison: null,
        ...overrides,
      };
    }

    it('maps every variant with its derived status and image URLs', async () => {
      reviewRead.findTestVariantSummaries.mockResolvedValue({
        name: 'checkout',
        kind: 'image',
        variants: [
          variantRow(),
          variantRow({
            viewport: '375x667',
            latestComparison: {
              id: 'cmp-1',
              status: ComparisonStatus.PENDING_APPROVAL,
              mismatchPixelCount: 42,
              diffImageUrl: 'http://storage/diff.png',
              candidate: { imageUrl: 'http://storage/candidate.png' },
            },
          }),
          variantRow({ viewport: '768x1024', baselineUrl: null }),
        ],
      });

      const result = await service.getTestVariants(
        'my-project',
        'checkout',
        'main',
      );

      expect(reviewRead.findTestVariantSummaries).toHaveBeenCalledWith(
        'my-project',
        'checkout',
        'main',
      );
      expect(result.variants).toEqual([
        {
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
          status: 'UNCHANGED',
          baselineUrl: 'http://storage/baseline.png',
          signedBaselineUrl: 'http://storage/baseline.png',
          candidateUrl: null,
          signedCandidateUrl: null,
          mismatchPixelCount: null,
          baselineInherited: false,
        },
        {
          viewport: '375x667',
          browser: 'chrome',
          environment: 'staging',
          status: 'PENDING_APPROVAL',
          baselineUrl: 'http://storage/baseline.png',
          signedBaselineUrl: 'http://storage/baseline.png',
          candidateUrl: 'http://storage/candidate.png',
          signedCandidateUrl: 'http://storage/candidate.png',
          mismatchPixelCount: 42,
          baselineInherited: false,
        },
        {
          viewport: '768x1024',
          browser: 'chrome',
          environment: 'staging',
          status: 'PENDING',
          baselineUrl: null,
          signedBaselineUrl: null,
          candidateUrl: null,
          signedCandidateUrl: null,
          mismatchPixelCount: null,
          baselineInherited: false,
        },
      ]);
    });

    it('rejects an unknown test', async () => {
      reviewRead.findTestVariantSummaries.mockResolvedValue(null);

      await expect(
        service.getTestVariants('my-project', 'missing'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Test "missing" not found in project "my-project"',
      });
    });

    it('rejects a PDF test', async () => {
      reviewRead.findTestVariantSummaries.mockResolvedValue({
        name: 'report',
        kind: 'pdf',
        variants: [],
      });
      testResolver.assertTestKind.mockImplementation(() => {
        throw new DomainError(
          'Test "report" is not an image test',
          'BAD_REQUEST',
        );
      });

      await expect(
        service.getTestVariants('my-project', 'report'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Test "report" is not an image test',
      });
      expect(testResolver.assertTestKind).toHaveBeenCalledWith(
        { name: 'report', kind: 'pdf' },
        'image',
      );
    });
  });

  describe('getPdfTestDetails', () => {
    const createdAt = new Date('2024-01-01');

    function entityResult(overrides: Record<string, unknown> = {}) {
      return {
        test: {
          id: 'test-1',
          name: 'my-test',
          status: 'PENDING',
          kind: 'pdf',
          createdAt,
        },
        baseline: null,
        comparison: null,
        ...overrides,
      };
    }

    it('maps entities to pdf test details when found', async () => {
      reviewRead.findTestWithVariants.mockResolvedValue(entityResult() as any);

      const result = await service.getPdfTestDetails('my-project', 'my-test', {
        viewport: '1920x1080',
      });

      expect(reviewRead.findTestWithVariants).toHaveBeenCalledWith(
        'my-project',
        'my-test',
        { viewport: '1920x1080' },
        undefined,
      );
      expect(result).toEqual({
        id: 'test-1',
        name: 'my-test',
        status: 'PENDING',
        kind: 'pdf',
        createdAt,
        baseline: null,
        comparison: null,
      });
    });

    it('maps baseline and comparison to pdf details', async () => {
      reviewRead.findTestWithVariants.mockResolvedValue(
        entityResult({
          baseline: {
            id: 'base-1',
            imageUrl: 'http://storage/base.pdf',
            imageHash: 'base-hash',
            pageCount: 5,
            viewport: '1280x720',
            browser: 'chrome',
            environment: 'production',
          },
          comparison: new ComparisonEntity({
            id: 'comp-1',
            visualTestId: 'test-1',
            mismatchPixelCount: 0,
            diffImageUrl: '',
            status: ComparisonStatus.PENDING_APPROVAL,
            baselineId: 'base-1',
            candidateId: 'cand-1',
            createdAt,
            mismatchPageCount: 3,
            candidate: new ScreenshotEntity({
              id: 'cand-1',
              visualTestId: 'test-1',
              type: ScreenshotType.CURRENT,
              imageHash: 'hash',
              imageUrl: 'http://storage/candidate.pdf',
              variant: Variant.fromStrings('1280x720', 'chrome', 'production'),
              createdAt,
              pixelDiffThreshold: 0,
            }),
          }),
        }) as any,
      );

      const result = await service.getPdfTestDetails('my-project', 'my-test', {
        viewport: '1280x720',
      });

      expect(result.baseline).toEqual({
        id: 'base-1',
        pdfUrl: 'http://storage/base.pdf',
        imageHash: 'base-hash',
        pageCount: 5,
        viewport: '1280x720',
        browser: 'chrome',
        environment: 'production',
      });
      expect(result.comparison).toEqual({
        id: 'comp-1',
        baselineId: 'base-1',
        diffPdfUrl: null,
        pageCount: null,
        mismatchPageCount: 3,
        status: 'PENDING_APPROVAL',
        createdAt,
        candidate: {
          id: 'cand-1',
          pdfUrl: 'http://storage/candidate.pdf',
          imageHash: 'hash',
          viewport: '1280x720',
          browser: 'chrome',
          environment: 'production',
        },
      });
    });

    it('leaves comparison null when absent', async () => {
      reviewRead.findTestWithVariants.mockResolvedValue(entityResult() as any);

      const result = await service.getPdfTestDetails('my-project', 'my-test', {
        viewport: '1920x1080',
      });

      expect(result.comparison).toBeNull();
    });

    it('passes filters to repository', async () => {
      reviewRead.findTestWithVariants.mockResolvedValue(entityResult() as any);

      await service.getPdfTestDetails('my-project', 'my-test', {
        viewport: '1920x1080',
      });

      expect(reviewRead.findTestWithVariants).toHaveBeenCalledWith(
        'my-project',
        'my-test',
        { viewport: '1920x1080' },
        undefined,
      );
    });

    it('throws DomainError when test not found', async () => {
      reviewRead.findTestWithVariants.mockResolvedValue(null);

      await expect(
        service.getPdfTestDetails('my-project', 'unknown-test', {
          viewport: '1920x1080',
        }),
      ).rejects.toThrow(DomainError);
    });

    it('rejects an image test through the PDF details endpoint', async () => {
      reviewRead.findTestWithVariants.mockResolvedValue(
        entityResult({ test: { kind: 'image' } }) as any,
      );
      testResolver.assertTestKind.mockImplementation(() => {
        throw new DomainError(
          'Test "my-test" is not a PDF test',
          'BAD_REQUEST',
        );
      });

      await expect(
        service.getPdfTestDetails('my-project', 'my-test', {
          viewport: '1920x1080',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(testResolver.assertTestKind).toHaveBeenCalledWith(
        { name: 'my-test', kind: 'image' },
        'pdf',
      );
    });

    it('rejects an empty variant filter instead of picking an arbitrary variant', async () => {
      await expect(
        service.getPdfTestDetails('my-project', 'my-test'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Variant filters (viewport/browser/environment) are required',
      });
      expect(reviewRead.findTestWithVariants).not.toHaveBeenCalled();
    });

    it('rejects an empty-string variant filter instead of picking an arbitrary variant', async () => {
      await expect(
        service.getPdfTestDetails('my-project', 'my-test', { viewport: '' }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Variant filter "viewport" must be a non-empty string',
      });
      expect(reviewRead.findTestWithVariants).not.toHaveBeenCalled();
    });
  });

  describe('getKind', () => {
    it('forwards the branch so a branch-only test resolves', async () => {
      testResolver.findTest.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'pdf',
        origin: 'branch',
        inheritedFrom: null,
      });

      const result = await service.getKind('proj', 'my-test', 'feature/x');

      expect(testResolver.findTest).toHaveBeenCalledWith(
        'proj',
        'my-test',
        'feature/x',
      );
      expect(result).toEqual({ kind: 'pdf' });
    });
  });
});
