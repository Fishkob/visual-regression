import { mapTestWithVariantsToPdfDetails } from '@public/visualTest/review/infrastructure/mappers/pdf-test-details.mapper';
import type { TestWithVariantsResult } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonStatus,
  ScreenshotType,
  TestStatus,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { TestKind } from '@/prisma/client';

const FIXED_DATE = new Date('2025-01-01T00:00:00Z');

function createScreenshot(
  overrides: Partial<ConstructorParameters<typeof ScreenshotEntity>[0]> = {},
): ScreenshotEntity {
  return new ScreenshotEntity({
    id: 'shot-baseline',
    visualTestId: 'test-1',
    type: ScreenshotType.BASELINE,
    imageHash: 'hash-baseline',
    imageUrl: 'http://storage/baseline.pdf',
    variant: Variant.fromStrings('1920x1080', 'chrome', 'prod'),
    createdAt: FIXED_DATE,
    pixelDiffThreshold: 0,
    pageCount: 3,
    ...overrides,
  });
}

function createComparison(
  overrides: Partial<ConstructorParameters<typeof ComparisonEntity>[0]> = {},
): ComparisonEntity {
  return new ComparisonEntity({
    id: 'cmp-1',
    visualTestId: 'test-1',
    mismatchPixelCount: 42,
    diffImageUrl: 'http://storage/diff.png',
    status: ComparisonStatus.PENDING_APPROVAL,
    baselineId: 'shot-baseline',
    candidateId: 'shot-candidate',
    createdAt: FIXED_DATE,
    baseline: createScreenshot(),
    candidate: createScreenshot({
      id: 'shot-candidate',
      type: ScreenshotType.CURRENT,
      imageHash: 'hash-candidate',
      imageUrl: 'http://storage/candidate.pdf',
    }),
    pageCount: 3,
    mismatchPageCount: 1,
    diffPdfUrl: 'http://storage/diff.pdf',
    ...overrides,
  });
}

function createResult(
  overrides: Partial<TestWithVariantsResult> = {},
): TestWithVariantsResult {
  return {
    test: {
      id: 'test-1',
      name: 'invoice',
      status: TestStatus.PENDING_APPROVAL,
      kind: TestKind.pdf,
      createdAt: FIXED_DATE,
    },
    baseline: createScreenshot(),
    comparison: createComparison(),
    ...overrides,
  };
}

describe('mapTestWithVariantsToPdfDetails', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a full result to pdf details', () => {
    const dto = mapTestWithVariantsToPdfDetails(createResult());

    expect(dto).toEqual({
      id: 'test-1',
      name: 'invoice',
      status: TestStatus.PENDING_APPROVAL,
      kind: TestKind.pdf,
      createdAt: FIXED_DATE,
      baseline: {
        id: 'shot-baseline',
        pdfUrl: 'http://storage/baseline.pdf',
        imageHash: 'hash-baseline',
        pageCount: 3,
        viewport: '1920x1080',
        browser: 'chrome',
        environment: 'prod',
      },
      comparison: {
        id: 'cmp-1',
        baselineId: 'shot-baseline',
        diffPdfUrl: 'http://storage/diff.pdf',
        pageCount: 3,
        mismatchPageCount: 1,
        status: ComparisonStatus.PENDING_APPROVAL,
        createdAt: FIXED_DATE,
        candidate: {
          id: 'shot-candidate',
          pdfUrl: 'http://storage/candidate.pdf',
          imageHash: 'hash-candidate',
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'prod',
        },
      },
    });
  });

  it('defaults baseline pageCount to null when absent', () => {
    const dto = mapTestWithVariantsToPdfDetails(
      createResult({ baseline: createScreenshot({ pageCount: undefined }) }),
    );

    expect(dto.baseline?.pageCount).toBeNull();
  });

  it('defaults comparison diff pageCount, mismatchPageCount and diffPdfUrl to null when absent', () => {
    const dto = mapTestWithVariantsToPdfDetails(
      createResult({
        comparison: createComparison({
          pageCount: undefined,
          mismatchPageCount: undefined,
          diffPdfUrl: undefined,
        }),
      }),
    );

    expect(dto.comparison?.pageCount).toBeNull();
    expect(dto.comparison?.mismatchPageCount).toBeNull();
    expect(dto.comparison?.diffPdfUrl).toBeNull();
  });

  it('leaves baseline null when the result has no baseline', () => {
    const dto = mapTestWithVariantsToPdfDetails(
      createResult({ baseline: null, comparison: null }),
    );

    expect(dto.baseline).toBeNull();
    expect(dto.comparison).toBeNull();
  });

  it('leaves comparison null when the result has no comparison', () => {
    const dto = mapTestWithVariantsToPdfDetails(
      createResult({ comparison: null }),
    );

    expect(dto.comparison).toBeNull();
    expect(dto.baseline).toBeDefined();
  });

  it('leaves candidate null when the comparison has no candidate', () => {
    const dto = mapTestWithVariantsToPdfDetails(
      createResult({
        comparison: createComparison({ candidate: null }),
      }),
    );

    expect(dto.comparison?.candidate).toBeNull();
  });
});
