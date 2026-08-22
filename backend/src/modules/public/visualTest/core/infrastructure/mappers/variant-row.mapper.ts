import {
  Variant,
  type VariantFilter,
} from '@public/visualTest/core/domain/value-objects/variant.vo';
import type { VariantRecord } from '@common/domain/variant-record';
import { DomainError } from '@common/domain/domain-error';
import type { Prisma } from '@/prisma/client';

// Prisma shape of a Screenshot row's related variant (`asBaseline`).
export type VariantRow = {
  asBaseline?: {
    viewport: string;
    browser: string;
    environment: string;
  } | null;
} | null;

export function variantToWhere(filter?: VariantFilter): Partial<VariantRecord> {
  if (!filter) return {};
  return {
    ...(filter.viewport ? { viewport: filter.viewport } : {}),
    ...(filter.browser ? { browser: filter.browser } : {}),
    ...(filter.environment ? { environment: filter.environment } : {}),
  };
}

// The one rule for "which variant row does a partial filter mean": both the
// write/status seam (VariantStore.resolveVariantIds) and the review read seam
// (TestReadRepository.resolveVariantWithBaseline) build their findFirst on
// this same where clause, so the filter→variant mapping cannot drift between
// the two seams. The tie-break below completes the rule.
export function variantResolutionWhere(
  testId: string,
  filter?: VariantFilter,
): { testId: string } & Partial<VariantRecord> {
  return { testId, ...variantToWhere(filter) };
}

// The tie-break half of the "which variant does a partial filter resolve to"
// rule: both the write/status seam (VariantStore) and the review read seam use
// this ordering on top of variantResolutionWhere, so a tie-break change lands
// in one place and the two seams cannot silently resolve different variants.
export const VARIANT_RESOLUTION_ORDER = [
  { viewport: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.UnifiedVariantOrderByWithRelationInput[];

export function variantFromRow(row: VariantRow): Variant {
  if (!row?.asBaseline) {
    // A comparison / baseline screenshot always belongs to exactly one variant
    // (FK + COMPARISON_INCLUDE guarantee it), so a missing variant row is an
    // invariant breach — fail loud instead of smuggling 'unknown' through the
    // read model.
    throw new DomainError(
      'Screenshot/comparison row is missing its variant relation',
      'INVALID_STATE',
    );
  }
  return Variant.fromStrings(
    row.asBaseline.viewport,
    row.asBaseline.browser,
    row.asBaseline.environment,
  );
}
