import { mapComparisonToDto } from '@public/visualTest/review/infrastructure/mappers/comparison-dto.mapper';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonStatus,
  ScreenshotType,
} from '@public/visualTest/core/domain/types/visual-test.types';

function createComparison(
  overrides: Partial<ComparisonEntity> = {},
): ComparisonEntity {
  const baseline = new ScreenshotEntity({
    id: 'b-1',
    visualTestId: 'vt-1',
    type: ScreenshotType.BASELINE,
    imageHash: 'hash',
    imageUrl: 'http://storage/baseline.png',
    variant: Variant.fromStrings('1920x1080', 'Chrome', 'production'),
    createdAt: new Date(),
    pixelDiffThreshold: 1,
  });
  const candidate = new ScreenshotEntity({
    id: 'c-1',
    visualTestId: 'vt-1',
    type: ScreenshotType.CURRENT,
    imageHash: 'hash2',
    imageUrl: 'http://storage/candidate.png',
    variant: Variant.fromStrings('1920x1080', 'Chrome', 'production'),
    createdAt: new Date(),
    pixelDiffThreshold: 0,
  });
  return new ComparisonEntity({
    id: 'cmp-1',
    visualTestId: 'vt-1',
    baselineId: 'b-1',
    candidateId: 'c-1',
    status: ComparisonStatus.PENDING_APPROVAL,
    mismatchPixelCount: 42,
    diffImageUrl: 'http://storage/diff.png',
    createdAt: new Date(),
    baseline,
    candidate,
    ...overrides,
  } as any);
}
describe('mapComparisonToDto', () => {
  it('maps full comparison to dto', () => {
    const comparison = createComparison();

    const dto = mapComparisonToDto(comparison);

    expect(dto.id).toBe('cmp-1');
    expect(dto.status).toBe(ComparisonStatus.PENDING_APPROVAL);
    expect(dto.diffImageUrl).toBe('http://storage/diff.png');
    expect(dto.mismatchPixelCount).toBe(42);
    expect(dto.baseline).toBeDefined();
    expect(dto.candidate).toBeDefined();
  });

  it('handles missing baseline', () => {
    const comparison = createComparison({
      baseline: undefined as unknown as ScreenshotEntity,
    });

    const dto = mapComparisonToDto(comparison);

    expect(dto.baseline).toBeUndefined();
    expect(dto.candidate).toBeDefined();
  });

  it('handles missing candidate', () => {
    const comparison = createComparison({
      candidate: undefined as unknown as ScreenshotEntity,
    });

    const dto = mapComparisonToDto(comparison);

    expect(dto.candidate).toBeUndefined();
    expect(dto.baseline).toBeDefined();
  });

  it('handles missing baseline pixelDiffThreshold', () => {
    const comparison = createComparison({
      baseline: undefined as unknown as ScreenshotEntity,
    });

    const dto = mapComparisonToDto(comparison);

    expect(dto.thresholdExceeded).toBe(false);
  });
});
