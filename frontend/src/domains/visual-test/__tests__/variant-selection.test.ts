import { describe, expect, it } from "vitest";
import {
  hasVariantFilter,
  pickPreferredVariant,
} from "@/domains/visual-test/variant-selection";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";
import type { TestStatusValue } from "@/domains/test-status";
import type { VariantParams } from "@/lib/variant-key";

function variant(status: TestStatusValue, viewport: string): VariantSummary {
  return {
    viewport,
    browser: "Chrome",
    environment: "staging",
    status,
    baselineInherited: false,
  };
}

describe("hasVariantFilter", () => {
  it("is false for an empty filter set", () => {
    expect(hasVariantFilter({})).toBe(false);
  });

  it("is false when only branch scope is present", () => {
    expect(
      hasVariantFilter({ branch: "main" } as unknown as VariantParams),
    ).toBe(false);
  });

  it("is true for any single variant coordinate", () => {
    expect(hasVariantFilter({ viewport: "1920x1080" })).toBe(true);
    expect(hasVariantFilter({ browser: "Chrome" })).toBe(true);
    expect(hasVariantFilter({ environment: "staging" })).toBe(true);
  });
});

describe("pickPreferredVariant", () => {
  it("prefers the variant that still needs review", () => {
    const picked = pickPreferredVariant([
      variant("UNCHANGED", "1366x768"),
      variant("PENDING_APPROVAL", "1920x1080"),
      variant("PENDING", "1024x768"),
    ]);

    expect(picked?.viewport).toBe("1920x1080");
  });

  it("falls back to the first variant when nothing is pending", () => {
    const picked = pickPreferredVariant([
      variant("UNCHANGED", "1366x768"),
      variant("UNCHANGED", "1920x1080"),
    ]);

    expect(picked?.viewport).toBe("1366x768");
  });

  it("returns undefined for an empty list", () => {
    expect(pickPreferredVariant([])).toBeUndefined();
  });
});
