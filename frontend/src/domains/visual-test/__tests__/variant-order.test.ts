import { describe, it, expect } from "vitest";
import {
  compareVariantSummaries,
  sortVariantSummaries,
} from "../variant-order";
import type { VariantSummary } from "../visual-test.model";

function variant(overrides: Partial<VariantSummary> = {}): VariantSummary {
  return {
    viewport: "1920x1080",
    browser: "chrome",
    environment: "staging",
    status: "UNCHANGED",
    baselineInherited: false,
    ...overrides,
  };
}

describe("compareVariantSummaries", () => {
  it("orders viewports numerically, not lexicographically", () => {
    const variants = [
      variant({ viewport: "1920x1080" }),
      variant({ viewport: "375x667" }),
      variant({ viewport: "768x1024" }),
    ];

    expect(sortVariantSummaries(variants).map((v) => v.viewport)).toEqual([
      "375x667",
      "768x1024",
      "1920x1080",
    ]);
  });

  it("orders by height when the width matches", () => {
    const variants = [
      variant({ viewport: "1920x1200" }),
      variant({ viewport: "1920x1080" }),
    ];

    expect(sortVariantSummaries(variants).map((v) => v.viewport)).toEqual([
      "1920x1080",
      "1920x1200",
    ]);
  });

  it("puts unparseable viewports last", () => {
    const variants = [
      variant({ viewport: "custom" }),
      variant({ viewport: "375x667" }),
    ];

    expect(sortVariantSummaries(variants).map((v) => v.viewport)).toEqual([
      "375x667",
      "custom",
    ]);
  });

  it("breaks ties on browser and then environment", () => {
    const variants = [
      variant({ browser: "webkit", environment: "staging" }),
      variant({ browser: "chrome", environment: "production" }),
      variant({ browser: "chrome", environment: "staging" }),
    ];

    expect(
      sortVariantSummaries(variants).map(
        (v) => `${v.browser}/${v.environment}`,
      ),
    ).toEqual(["chrome/production", "chrome/staging", "webkit/staging"]);
  });

  it("keeps the source array untouched", () => {
    const variants = [
      variant({ viewport: "1920x1080" }),
      variant({ viewport: "375x667" }),
    ];

    sortVariantSummaries(variants);

    expect(variants.map((v) => v.viewport)).toEqual(["1920x1080", "375x667"]);
  });

  it("returns zero for identical configurations", () => {
    expect(compareVariantSummaries(variant(), variant())).toBe(0);
  });
});
