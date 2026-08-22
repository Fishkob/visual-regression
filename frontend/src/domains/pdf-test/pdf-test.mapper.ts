import type { PdfTestDetailsDto, PdfComparisonDetailsDto } from "@sdk";
import type {
  PdfComparison,
  PdfScreenshot,
  PdfTestDetails,
} from "./pdf-test.model";
import { variantFromDto } from "@/lib/variant-key";

// One mapper for every screenshot-shaped DTO. Only the baseline variant carries
// a page count (number | null, normalized to a non-null model value); the
// candidate DTO has no pageCount field, so it is left off the model.
type PdfScreenshotSource = {
  pdfUrl: string;
  imageHash: string;
  pageCount?: number | null;
  viewport: string;
  browser: string;
  environment: string;
};

function mapPdfScreenshot(
  dto: PdfScreenshotSource | null | undefined,
): PdfScreenshot | undefined {
  if (!dto) return undefined;
  return {
    pdfUrl: dto.pdfUrl,
    imageHash: dto.imageHash,
    ...("pageCount" in dto ? { pageCount: dto.pageCount ?? 0 } : {}),
    ...variantFromDto(dto),
  };
}

function mapPdfComparison(
  dto: PdfComparisonDetailsDto | null | undefined,
): PdfComparison | undefined {
  if (!dto) return undefined;
  return {
    id: dto.id,
    diffPdfUrl: dto.diffPdfUrl ?? "",
    pageCount: dto.pageCount ?? 0,
    mismatchPageCount: dto.mismatchPageCount ?? 0,
    status: dto.status,
    createdAt: dto.createdAt,
    candidate: mapPdfScreenshot(dto.candidate),
  };
}

export function mapPdfTestDetails(
  dto: PdfTestDetailsDto | null | undefined,
): PdfTestDetails | null {
  if (!dto) return null;
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status,
    createdAt: dto.createdAt,
    baseline: mapPdfScreenshot(dto.baseline),
    comparison: mapPdfComparison(dto.comparison),
  };
}
