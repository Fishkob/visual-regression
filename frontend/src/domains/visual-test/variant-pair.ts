import type { VariantSummary } from "./visual-test.model";
import { variantKeyParts, type VariantParams } from "@/lib/variant-key";

// The modes that compare two variants of one viewport. They are the review
// viewer's overlay/wipe/blink, minus the diff-only modes that need a stored
// diff artifact: here the two pictures are simply two browsers.
export type VariantCompareMode = "side-by-side" | "overlay" | "wipe" | "blink";

export const VARIANT_COMPARE_MODES: readonly VariantCompareMode[] = [
  "side-by-side",
  "overlay",
  "wipe",
  "blink",
];

export interface VariantPair {
  reference: VariantSummary;
  target?: VariantSummary;
}

// The `|`-joined tuple is the tile identity in the markup (data-variant-key) and
// in the specs that address a variant; sharing one derivation keeps the pair
// selection and the DOM attribute from disagreeing on a dimension.
export function variantKey(variant: VariantParams): string {
  return variantKeyParts(variant).join("|");
}

// Layered comparison (overlay/wipe/blink) needs exactly two variants of one
// viewport: the reference the others are judged against, and one target. Keys
// rather than indices survive a refetch that reorders the gallery, and an
// unknown or self-referencing key falls back to the gallery order so the stage
// never renders an empty or doubled picture.
export function resolveVariantPair(
  variants: readonly VariantSummary[],
  referenceKey?: string,
  targetKey?: string,
): VariantPair | undefined {
  const [first] = variants;
  if (!first) return undefined;

  const reference =
    variants.find((variant) => variantKey(variant) === referenceKey) ?? first;
  const target =
    variants.find(
      (variant) => variant !== reference && variantKey(variant) === targetKey,
    ) ?? variants.find((variant) => variant !== reference);

  return { reference, target };
}
