import { mapTestVariantsToDto } from '@public/visualTest/review/infrastructure/mappers/test-variants.mapper';
import type { TestVariantSummaryResult } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import type { VariantSummaryRow } from '@public/visualTest/core/infrastructure/repositories/variant-store';

describe('test-variants.mapper', () => {
  function variantRow(
    overrides: Partial<VariantSummaryRow> = {},
  ): VariantSummaryRow {
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

  function result(
    overrides: Partial<TestVariantSummaryResult> = {},
  ): TestVariantSummaryResult {
    return {
      name: 'checkout',
      kind: 'image',
      variants: [],
      ...overrides,
    };
  }

  it('maps the test identity and an empty variant list', () => {
    expect(mapTestVariantsToDto(result())).toMatchObject({
      name: 'checkout',
      kind: 'image',
      variants: [],
    });
  });

  it('derives the per-variant status from the latest comparison and baseline', () => {
    const dto = mapTestVariantsToDto(
      result({
        variants: [
          variantRow(),
          variantRow({
            viewport: '375x667',
            latestComparison: {
              status: 'PENDING_APPROVAL',
              mismatchPixelCount: 42,
              candidate: { imageUrl: 'http://storage/candidate.png' },
            },
          }),
          variantRow({ viewport: '768x1024', baselineUrl: null }),
        ],
      }),
    );

    expect(dto.variants.map((variant) => variant.status)).toEqual([
      'UNCHANGED',
      'PENDING_APPROVAL',
      'PENDING',
    ]);
  });

  it('surfaces the candidate URL only for a pending comparison', () => {
    const dto = mapTestVariantsToDto(
      result({
        variants: [
          variantRow(),
          variantRow({
            latestComparison: {
              status: 'PENDING_APPROVAL',
              mismatchPixelCount: 7,
              candidate: { imageUrl: 'http://storage/candidate.png' },
            },
          }),
        ],
      }),
    );

    expect(dto.variants[0]).toMatchObject({
      baselineUrl: 'http://storage/baseline.png',
      candidateUrl: null,
      mismatchPixelCount: null,
    });
    expect(dto.variants[1]).toMatchObject({
      baselineUrl: 'http://storage/baseline.png',
      candidateUrl: 'http://storage/candidate.png',
      mismatchPixelCount: 7,
    });
  });

  it('keeps the inherited-baseline flag per variant', () => {
    const dto = mapTestVariantsToDto(
      result({
        variants: [
          variantRow({ isInherited: true }),
          variantRow({ viewport: '375x667' }),
        ],
      }),
    );

    expect(dto.variants.map((variant) => variant.baselineInherited)).toEqual([
      true,
      false,
    ]);
  });
});
