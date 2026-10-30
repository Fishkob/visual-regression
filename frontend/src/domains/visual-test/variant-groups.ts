import type { VariantSummary } from "./visual-test.model";
import { sortVariantSummaries } from "./variant-order";
import { parseViewport } from "./viewport";

export interface ViewportGroup {
  viewport: string;
  variants: VariantSummary[];
  // Width of this viewport relative to the widest one in the gallery (1 = the
  // widest), so a 1366 tile renders visibly narrower than a 1920 tile.
  relativeWidth: number;
  // CSS aspect-ratio of the baseline frame, taken from the viewport itself.
  aspectRatio: string;
}

const FALLBACK_ASPECT_RATIO = "16 / 9";

// The overview groups the variants by viewport instead of listing every
// (viewport, browser, environment) tile flat: the point of the page is "how does
// this test look at each size", and the browsers of one size belong side by side.
// Groups keep the gallery order (small → large), variants keep the gallery order
// inside their group (browser, then environment).
export function groupVariantsByViewport(
  variants: readonly VariantSummary[],
): ViewportGroup[] {
  const groups: ViewportGroup[] = [];
  const byViewport = new Map<string, ViewportGroup>();

  for (const variant of sortVariantSummaries(variants)) {
    const existing = byViewport.get(variant.viewport);
    if (existing) {
      existing.variants.push(variant);
      continue;
    }
    const size = parseViewport(variant.viewport);
    const group: ViewportGroup = {
      viewport: variant.viewport,
      variants: [variant],
      relativeWidth: 1,
      aspectRatio: size
        ? `${size.width} / ${size.height}`
        : FALLBACK_ASPECT_RATIO,
    };
    byViewport.set(variant.viewport, group);
    groups.push(group);
  }

  const widest = groups.reduce(
    (max, group) => Math.max(max, parseViewport(group.viewport)?.width ?? 0),
    0,
  );
  if (widest > 0) {
    for (const group of groups) {
      const width = parseViewport(group.viewport)?.width;
      if (width) group.relativeWidth = width / widest;
    }
  }

  return groups;
}
