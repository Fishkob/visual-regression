import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import type { ChangedRegion } from '@common/domain/changed-region.type';
import type { Prisma } from '@/prisma/client';
import { toScreenshotEntity } from '@public/visualTest/core/infrastructure/mappers/screenshot.mapper';
import { variantFromRow } from '@public/visualTest/core/infrastructure/mappers/variant-row.mapper';

export const COMPARISON_INCLUDE = {
  baseline: { include: { asBaseline: true } },
  candidate: true,
} as const;

export type ComparisonRow = Prisma.UnifiedComparisonGetPayload<{
  include: typeof COMPARISON_INCLUDE;
}>;

function readRegion(entry: Prisma.JsonValue): ChangedRegion | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return null;
  }
  const { x, y, width, height, pixelCount } = entry as Record<string, unknown>;
  const numbers = [x, y, width, height, pixelCount];
  if (!numbers.every((value) => typeof value === 'number' && isFinite(value))) {
    return null;
  }
  return {
    x: x as number,
    y: y as number,
    width: width as number,
    height: height as number,
    pixelCount: pixelCount as number,
  };
}

// A stored region list is read leniently: a row written by an older worker (or
// a partially corrupt array) must degrade to "no regions", never break the
// review page it describes.
export function toChangedRegions(
  value: Prisma.JsonValue | null,
): ChangedRegion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const regions = value
    .map(readRegion)
    .filter((region): region is ChangedRegion => region !== null);
  return regions.length > 0 ? regions : undefined;
}

export function toComparisonEntityWithRelations(
  prisma: ComparisonRow,
): ComparisonEntity {
  const variant = variantFromRow(prisma.baseline);

  const baseline = prisma.baseline
    ? toScreenshotEntity(prisma.baseline, variant)
    : undefined;

  const candidate = prisma.candidate
    ? toScreenshotEntity(prisma.candidate, variant)
    : undefined;

  return new ComparisonEntity({
    id: prisma.id,
    visualTestId: prisma.testId,
    mismatchPixelCount: prisma.mismatchPixelCount,
    diffImageUrl: prisma.diffImageUrl,
    status: prisma.status,
    baselineId: prisma.baselineId,
    candidateId: prisma.candidateId ?? undefined,
    createdAt: prisma.createdAt,
    pageCount: prisma.pageCount ?? undefined,
    mismatchPageCount: prisma.mismatchPageCount ?? undefined,
    diffPdfUrl: prisma.diffPdfUrl ?? undefined,
    runId: prisma.runId ?? undefined,
    runKey: prisma.runKey ?? undefined,
    changedRegions: toChangedRegions(prisma.changedRegions),
    baseline,
    candidate,
  });
}
