import { describe, it, expect } from "vitest";
import { resolveVariantPair, variantKey } from "../variant-pair";
import type { VariantSummary } from "../visual-test.model";

function variant(overrides: Partial<VariantSummary> = {}): VariantSummary {
  return {
    viewport: "1920x1080",
    browser: "Chrome",
    environment: "staging",
    status: "UNCHANGED",
    baselineInherited: false,
    ...overrides,
  };
}

const chrome = variant({ browser: "Chrome" });
const firefox = variant({ browser: "Firefox" });
const safari = variant({ browser: "Safari" });

describe("variantKey", () => {
  it("joins the three variant coordinates", () => {
    expect(variantKey(chrome)).toBe("1920x1080|Chrome|staging");
  });
});

describe("resolveVariantPair", () => {
  it("returns nothing for an empty gallery", () => {
    expect(resolveVariantPair([])).toBeUndefined();
  });

  it("defaults to the first two variants in gallery order", () => {
    expect(resolveVariantPair([chrome, firefox, safari])).toEqual({
      reference: chrome,
      target: firefox,
    });
  });

  it("has no target when the viewport has a single browser", () => {
    const pair = resolveVariantPair([chrome]);
    expect(pair?.reference).toBe(chrome);
    expect(pair?.target).toBeUndefined();
  });

  it("honours both selected keys", () => {
    const pair = resolveVariantPair(
      [chrome, firefox, safari],
      variantKey(safari),
      variantKey(chrome),
    );
    expect(pair?.reference).toBe(safari);
    expect(pair?.target).toBe(chrome);
  });

  it("falls back to the first variant for an unknown reference", () => {
    const pair = resolveVariantPair([chrome, firefox], "1024x768|Brave|dev");
    expect(pair?.reference).toBe(chrome);
    expect(pair?.target).toBe(firefox);
  });

  it("picks another variant when the target repeats the reference", () => {
    const pair = resolveVariantPair(
      [chrome, firefox, safari],
      variantKey(firefox),
      variantKey(firefox),
    );
    expect(pair?.reference).toBe(firefox);
    expect(pair?.target).not.toBe(firefox);
    expect([chrome, safari]).toContain(pair?.target);
  });

  it("falls back to a sibling when the target key is unknown", () => {
    const pair = resolveVariantPair(
      [chrome, firefox],
      variantKey(firefox),
      "nope",
    );
    expect(pair?.reference).toBe(firefox);
    expect(pair?.target).toBe(chrome);
  });
});
