import type { VariantSummary } from "./visual-test.model";

const VIEWPORT_PATTERN = /^(\d+)x(\d+)$/;

function viewportSize(viewport: string): [number, number] | null {
  const match = VIEWPORT_PATTERN.exec(viewport.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

// Gallery order: small viewports before large ones (numeric, not lexicographic
// — "375x667" must not sort after "1920x1080"), unknown formats last, then a
// stable tie-break on browser/environment so the tiles never jump between
// renders. Pure and exported so the ordering rule has one test seam.
export function compareVariantSummaries(
  left: VariantSummary,
  right: VariantSummary,
): number {
  const leftSize = viewportSize(left.viewport);
  const rightSize = viewportSize(right.viewport);
  if (leftSize && rightSize) {
    const widthDifference = leftSize[0] - rightSize[0];
    if (widthDifference !== 0) return widthDifference;
    const heightDifference = leftSize[1] - rightSize[1];
    if (heightDifference !== 0) return heightDifference;
  } else if (leftSize) {
    return -1;
  } else if (rightSize) {
    return 1;
  }

  return (
    compareStrings(left.viewport, right.viewport) ||
    compareStrings(left.browser, right.browser) ||
    compareStrings(left.environment, right.environment)
  );
}

export function sortVariantSummaries(
  variants: readonly VariantSummary[],
): VariantSummary[] {
  return [...variants].sort(compareVariantSummaries);
}
