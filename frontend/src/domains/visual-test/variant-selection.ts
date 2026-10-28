import { isPendingApproval } from "@/domains/test-status";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";
import type { VariantParams } from "@/lib/variant-key";

// A variant filter is any of the three coordinates. `branch` is route scope,
// not a variant coordinate, and must not make a link look variant-addressed.
export function hasVariantFilter(filters: VariantParams): boolean {
  return Boolean(filters.viewport || filters.browser || filters.environment);
}

// Where a test link that names no variant should land: the change still waiting
// for review, otherwise the first variant (an unchanged test still opens on its
// baseline). The gallery's own ordering stays the tie-break, so the resolved
// variant matches the first tile a reviewer sees.
export function pickPreferredVariant(
  variants: VariantSummary[],
): VariantSummary | undefined {
  return (
    variants.find((variant) => isPendingApproval(variant.status)) ?? variants[0]
  );
}
