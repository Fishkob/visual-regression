import { describe, it, expect } from "vitest";
import { groupVariantsByViewport } from "../variant-groups";
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

describe("groupVariantsByViewport", () => {
  it("groups by viewport in gallery order, smallest first", () => {
    const groups = groupVariantsByViewport([
      variant({ viewport: "1920x1080" }),
      variant({ viewport: "375x667" }),
      variant({ viewport: "1366x768" }),
    ]);

    expect(groups.map((group) => group.viewport)).toEqual([
      "375x667",
      "1366x768",
      "1920x1080",
    ]);
    expect(groups.every((group) => group.variants.length === 1)).toBe(true);
  });

  it("keeps the browsers of one viewport together, ordered by browser", () => {
    const groups = groupVariantsByViewport([
      variant({ viewport: "1920x1080", browser: "Safari" }),
      variant({ viewport: "1366x768", browser: "Chrome" }),
      variant({ viewport: "1920x1080", browser: "Chrome" }),
      variant({ viewport: "1920x1080", browser: "Firefox" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[1].viewport).toBe("1920x1080");
    expect(groups[1].variants.map((item) => item.browser)).toEqual([
      "Chrome",
      "Firefox",
      "Safari",
    ]);
  });

  it("sizes each viewport relative to the widest one", () => {
    const groups = groupVariantsByViewport([
      variant({ viewport: "1920x1080" }),
      variant({ viewport: "1366x768" }),
    ]);

    expect(groups.map((group) => group.relativeWidth)).toEqual([
      1366 / 1920,
      1,
    ]);
  });

  it("derives the frame aspect ratio from the viewport", () => {
    const groups = groupVariantsByViewport([
      variant({ viewport: "375x667" }),
      variant({ viewport: "1920x1080" }),
    ]);

    expect(groups.map((group) => group.aspectRatio)).toEqual([
      "375 / 667",
      "1920 / 1080",
    ]);
  });

  it("falls back to full width and 16:9 for a free-form viewport", () => {
    const groups = groupVariantsByViewport([
      variant({ viewport: "1920x1080" }),
      variant({ viewport: "custom" }),
    ]);

    expect(groups[1]).toMatchObject({
      viewport: "custom",
      relativeWidth: 1,
      aspectRatio: "16 / 9",
    });
  });

  it("returns no groups for no variants", () => {
    expect(groupVariantsByViewport([])).toEqual([]);
  });
});
