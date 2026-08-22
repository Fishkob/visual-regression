import type { TestKind } from '@common/domain/test-kind';

interface ComparisonResultBase {
  diffOutput: Buffer;
  pageCount?: number;
}

export interface ImageComparisonResult extends ComparisonResultBase {
  kind: 'image';
  mismatchPixelCount: number;
}

export interface PdfComparisonResult extends ComparisonResultBase {
  kind: 'pdf';
  mismatchPageCount: number;
}

export type ComparisonResult = ImageComparisonResult | PdfComparisonResult;

export function mismatchCount(result: ComparisonResult): number {
  return result.kind === 'image'
    ? result.mismatchPixelCount
    : result.mismatchPageCount;
}

export const COMPARISON_ENGINES = 'COMPARISON_ENGINES';

// The PDF comparison engine, sealed behind the engine face only (kind +
// compare) so a consumer never reaches the concrete HTTP client's page-counter
// or renderer surface. The pdf-sidecar module provides it via
// useExisting: PdfSidecarClient — mirroring the job-queue module's token-only
// export convention.
export const PDF_COMPARISON_ENGINE = 'PDF_COMPARISON_ENGINE';

export type ComparisonEngines = Record<TestKind, IComparisonEngine>;

// The comparison engine's anti-aliasing tolerance (a fixed 0-1 float). This is
// deliberately NOT the business threshold — see CONTEXT.md: pixelDiffThreshold
// never reaches the comparison engine.
export const ENGINE_TOLERANCE = 0;

export interface IComparisonEngine {
  readonly kind: TestKind;
  compare(expected: Buffer, actual: Buffer): Promise<ComparisonResult>;
}
