import { mapComparisonToDto } from '@public/visualTest/review/infrastructure/mappers/comparison-dto.mapper';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonStatus,
  ScreenshotType,
} from '@public/visualTest/core/domain/types/visual-test.types';

const identitySigner = (url: string): string => url;

type ComparisonParams = ConstructorParameters<typeof ComparisonEntity>[0];

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
  } as unknown as ComparisonParams);
}
describe('mapComparisonToDto', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps full comparison to dto', () => {
    const comparison = createComparison();

    const dto = mapComparisonToDto(comparison, identitySigner);

    expect(dto.id).toBe('cmp-1');
    expect(dto.status).toBe(ComparisonStatus.PENDING_APPROVAL);
    expect(dto.diffImageUrl).toBe('http://storage/diff.png');
    expect(dto.mismatchPixelCount).toBe(42);
    expect(dto.baseline).toBeDefined();
    expect(dto.candidate).toBeDefined();
  });

  it('maps changed regions onto the dto', () => {
    const comparison = createComparison({
      changedRegions: [{ x: 1, y: 2, width: 3, height: 4, pixelCount: 5 }],
    } as unknown as Partial<ComparisonEntity>);

    const dto = mapComparisonToDto(comparison, identitySigner);

    expect(dto.changedRegions).toEqual([
      { x: 1, y: 2, width: 3, height: 4, pixelCount: 5 },
    ]);
  });

  it('leaves changed regions out when the comparison has none', () => {
    const dto = mapComparisonToDto(createComparison(), identitySigner);

    expect(dto.changedRegions).toBeUndefined();
  });

  it('handles missing baseline', () => {
    const comparison = createComparison({
      baseline: undefined as unknown as ScreenshotEntity,
    });

    const dto = mapComparisonToDto(comparison, identitySigner);

    expect(dto.baseline).toBeUndefined();
    expect(dto.candidate).toBeDefined();
  });

  it('handles missing candidate', () => {
    const comparison = createComparison({
      candidate: undefined as unknown as ScreenshotEntity,
    });

    const dto = mapComparisonToDto(comparison, identitySigner);

    expect(dto.candidate).toBeUndefined();
    expect(dto.baseline).toBeDefined();
  });

  it('handles missing baseline pixelDiffThreshold', () => {
    const comparison = createComparison({
      baseline: undefined as unknown as ScreenshotEntity,
    });

    const dto = mapComparisonToDto(comparison, identitySigner);

    expect(dto.thresholdExceeded).toBe(false);
  });

  it('returns canonical and signed urls side by side', () => {
    const sign = (url: string): string => `${url}?X-Amz-Signature=sig`;

    const dto = mapComparisonToDto(createComparison(), sign);

    expect(dto.diffImageUrl).toBe('http://storage/diff.png');
    expect(dto.signedDiffImageUrl).toBe(
      'http://storage/diff.png?X-Amz-Signature=sig',
    );
    expect(dto.baseline?.imageUrl).toBe('http://storage/baseline.png');
    expect(dto.baseline?.signedImageUrl).toBe(
      'http://storage/baseline.png?X-Amz-Signature=sig',
    );
    expect(dto.candidate?.imageUrl).toBe('http://storage/candidate.png');
    expect(dto.candidate?.signedImageUrl).toBe(
      'http://storage/candidate.png?X-Amz-Signature=sig',
    );
  });
});
