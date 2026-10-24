import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TestVariantGallery from "@/components/detail-panels/TestVariantGallery.vue";
import { TEST_ID } from "@/lib/test-ids";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";

function variant(overrides: Partial<VariantSummary> = {}): VariantSummary {
  return {
    viewport: "1920x1080",
    browser: "chrome",
    environment: "staging",
    status: "UNCHANGED",
    baselineUrl: "/baseline.png",
    baselineInherited: false,
    ...overrides,
  };
}

describe("TestVariantGallery", () => {
  it("renders one tile per variant ordered by viewport size", () => {
    const wrapper = mount(TestVariantGallery, {
      props: {
        variants: [
          variant({ viewport: "1920x1080" }),
          variant({ viewport: "375x667" }),
          variant({ viewport: "768x1024" }),
        ],
      },
    });

    expect(
      wrapper
        .findAll(`[data-testid="${TEST_ID.variantGalleryTile}"]`)
        .map((tile) => tile.attributes("data-variant-key")),
    ).toEqual([
      "375x667|chrome|staging",
      "768x1024|chrome|staging",
      "1920x1080|chrome|staging",
    ]);
  });

  it("marks exactly the resolved variant as pressed", () => {
    const wrapper = mount(TestVariantGallery, {
      props: {
        variants: [
          variant({ viewport: "1920x1080" }),
          variant({ viewport: "375x667" }),
        ],
        active: {
          viewport: "375x667",
          browser: "chrome",
          environment: "staging",
        },
      },
    });

    expect(
      wrapper
        .findAll(`[data-testid="${TEST_ID.variantGalleryTile}"]`)
        .map((tile) => tile.attributes("aria-pressed")),
    ).toEqual(["true", "false"]);
  });

  it("does not press a tile when the active variant is not in the list", () => {
    const wrapper = mount(TestVariantGallery, {
      props: {
        variants: [variant({ viewport: "1920x1080" })],
        active: { viewport: "1280x800" },
      },
    });

    expect(
      wrapper
        .find(`[data-testid="${TEST_ID.variantGalleryTile}"]`)
        .attributes("aria-pressed"),
    ).toBe("false");
  });

  it("emits the clicked variant", async () => {
    const target = variant({ viewport: "375x667" });
    const wrapper = mount(TestVariantGallery, {
      props: {
        variants: [variant({ viewport: "1920x1080" }), target],
      },
    });

    await wrapper
      .find('[data-variant-key="1920x1080|chrome|staging"]')
      .trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      [variant({ viewport: "1920x1080" })],
    ]);
  });

  it("prefers the candidate image and shows the mismatch count while pending", () => {
    const wrapper = mount(TestVariantGallery, {
      props: {
        variants: [
          variant({
            status: "PENDING_APPROVAL",
            candidateUrl: "/candidate.png",
            mismatchPixelCount: 1234,
          }),
        ],
      },
    });

    expect(wrapper.find("img").attributes("src")).toBe("/candidate.png");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.variantGalleryMismatch}"]`).text(),
    ).toBe("1,234 px");
  });

  it("falls back to the baseline image for a clean variant", () => {
    const wrapper = mount(TestVariantGallery, {
      props: { variants: [variant()] },
    });

    expect(wrapper.find("img").attributes("src")).toBe("/baseline.png");
    expect(
      wrapper
        .find(`[data-testid="${TEST_ID.variantGalleryMismatch}"]`)
        .exists(),
    ).toBe(false);
  });

  it("renders a placeholder for a variant without a baseline", () => {
    const wrapper = mount(TestVariantGallery, {
      props: {
        variants: [variant({ status: "PENDING", baselineUrl: undefined })],
      },
    });

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("No baseline");
  });

  it("counts pending variants in the header", () => {
    const wrapper = mount(TestVariantGallery, {
      props: {
        variants: [
          variant({ status: "PENDING_APPROVAL" }),
          variant({ viewport: "375x667", status: "PENDING_APPROVAL" }),
          variant({ viewport: "768x1024" }),
        ],
      },
    });

    expect(
      wrapper
        .find(`[data-testid="${TEST_ID.variantGalleryPendingCount}"]`)
        .text(),
    ).toBe("2 pending");
  });

  it("flags an inherited baseline in the tile meta line", () => {
    const wrapper = mount(TestVariantGallery, {
      props: { variants: [variant({ baselineInherited: true })] },
    });

    expect(wrapper.text()).toContain("inherited");
  });

  it("renders nothing without variants", () => {
    const wrapper = mount(TestVariantGallery, {
      props: { variants: [] },
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.variantGallery}"]`).exists(),
    ).toBe(false);
  });
});
