import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
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
    baseline,
    candidate,
  });
}
