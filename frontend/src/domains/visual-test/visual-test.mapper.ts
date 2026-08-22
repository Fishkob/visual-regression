import type { ScreenshotDto, ComparisonDto, VisualTestDetailsDto } from "@sdk";
import type {
  Screenshot,
  Comparison,
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
  };
}
