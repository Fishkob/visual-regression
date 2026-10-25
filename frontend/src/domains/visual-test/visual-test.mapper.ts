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

// The API returns both the canonical storage URL (identity) and a presigned
// URL (what the browser can actually fetch). The view model holds the signed
// one and falls back to the canonical URL for older/mocked payloads.
function renderableUrl(
  signed: string | undefined,
  canonical: string | undefined,
): string {
  return signed ?? canonical ?? "";
}

function mapScreenshot(dto: ScreenshotDto | undefined): Screenshot | undefined {
  if (!dto) return undefined;
  return {
    imageUrl: renderableUrl(dto.signedImageUrl, dto.imageUrl),
    pixelDiffThreshold: dto.pixelDiffThreshold,
    ...(dto.variant ?? {}),
  };
}

function mapComparison(dto: ComparisonDto | undefined): Comparison | undefined {
  if (!dto) return undefined;
  return {
    id: dto.id,
    diffImageUrl: renderableUrl(dto.signedDiffImageUrl, dto.diffImageUrl),
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
      ...((variant.signedBaselineUrl ?? variant.baselineUrl)
        ? {
            baselineUrl:
              variant.signedBaselineUrl ?? variant.baselineUrl ?? undefined,
          }
        : {}),
      ...((variant.signedCandidateUrl ?? variant.candidateUrl)
        ? {
            candidateUrl:
              variant.signedCandidateUrl ?? variant.candidateUrl ?? undefined,
          }
        : {}),
      ...(variant.mismatchPixelCount != null
        ? { mismatchPixelCount: variant.mismatchPixelCount }
        : {}),
    })),
  };
}
