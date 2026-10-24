import type {
  ScreenshotDto,
  ComparisonDto,
  TestVariantsDto,
  VisualTestDetailsDto,
} from "@sdk";
import type {
  Screenshot,
  Comparison,
  TestVariants,
  VisualTestDetails,
} from "./visual-test.model";

function mapScreenshot(dto: ScreenshotDto | undefined): Screenshot | undefined {
  if (!dto) return undefined;
  return {
    imageUrl: dto.imageUrl ?? "",
    pixelDiffThreshold: dto.pixelDiffThreshold,
    ...(dto.variant ?? {}),
  };
}

function mapComparison(dto: ComparisonDto | undefined): Comparison | undefined {
  if (!dto) return undefined;
  return {
    id: dto.id,
    diffImageUrl: dto.diffImageUrl ?? "",
    mismatchPixelCount: dto.mismatchPixelCount,
    status: dto.status,
    thresholdExceeded: dto.thresholdExceeded,
    createdAt: dto.createdAt,
    baseline: mapScreenshot(dto.baseline),
    candidate: mapScreenshot(dto.candidate),
  };
}

export function mapVisualTestDetails(
  dto: VisualTestDetailsDto | null | undefined,
): VisualTestDetails | null {
  if (!dto) return null;
  return {
    name: dto.name,
    baseline: mapScreenshot(dto.baseline),
    comparison: mapComparison(dto.comparison),
    ...(dto.origin ? { origin: dto.origin } : {}),
    ...(dto.inheritedFrom !== undefined
      ? { inheritedFrom: dto.inheritedFrom }
      : {}),
    ...(dto.baselineInherited ? { baselineInherited: true } : {}),
    ...(dto.inheritTarget !== undefined
      ? { inheritTarget: dto.inheritTarget }
      : {}),
  };
}

export function mapTestVariants(
  dto: TestVariantsDto | null | undefined,
): TestVariants | null {
  if (!dto) return null;
  return {
    name: dto.name,
    kind: dto.kind,
    variants: dto.variants.map((variant) => ({
      viewport: variant.viewport,
      browser: variant.browser,
      environment: variant.environment,
      status: variant.status,
      baselineInherited: variant.baselineInherited,
      ...(variant.baselineUrl ? { baselineUrl: variant.baselineUrl } : {}),
      ...(variant.candidateUrl ? { candidateUrl: variant.candidateUrl } : {}),
      ...(variant.mismatchPixelCount != null
        ? { mismatchPixelCount: variant.mismatchPixelCount }
        : {}),
    })),
  };
}
