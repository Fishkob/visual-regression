import type { TestWithVariantsResult } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { PdfTestDetailsDto } from '@public/visualTest/review/presentation/dto/pdf-test-details.dto';

export function mapTestWithVariantsToPdfDetails(
  result: TestWithVariantsResult,
): PdfTestDetailsDto {
  const details: PdfTestDetailsDto = {
    id: result.test.id,
    name: result.test.name,
    status: result.test.status,
    kind: result.test.kind,
    createdAt: result.test.createdAt,
    origin: result.test.origin,
    inheritedFrom: result.test.inheritedFrom,
    baselineInherited: result.baselineInherited,
    inheritTarget: result.inheritTarget,
    baseline: result.baseline
      ? {
          id: result.baseline.id,
          pdfUrl: result.baseline.imageUrl,
          imageHash: result.baseline.imageHash,
          pageCount: result.baseline.pageCount ?? null,
          viewport: result.baseline.viewport,
          browser: result.baseline.browser,
          environment: result.baseline.environment,
        }
      : null,
    comparison: result.comparison
      ? {
          id: result.comparison.id,
          baselineId: result.comparison.baselineId,
          diffPdfUrl: result.comparison.diffPdfUrl ?? null,
          pageCount: result.comparison.pageCount ?? null,
          mismatchPageCount: result.comparison.mismatchPageCount ?? null,
          status: result.comparison.status,
          createdAt: result.comparison.createdAt,
          candidate: result.comparison.candidate
            ? {
                id: result.comparison.candidate.id,
                pdfUrl: result.comparison.candidate.imageUrl,
                imageHash: result.comparison.candidate.imageHash,
                viewport: result.comparison.candidate.viewport,
                browser: result.comparison.candidate.browser,
                environment: result.comparison.candidate.environment,
              }
            : null,
        }
      : null,
  };
  return details;
}
