import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChangedRegionRail from "@/components/detail-panels/ChangedRegionRail.vue";
import { TEST_ID } from "@/lib/test-ids";

const REGIONS = [
  { x: 10, y: 20, width: 100, height: 50, pixelCount: 500 },
  { x: 300, y: 400, width: 20, height: 20, pixelCount: 40 },
];

function mountRail(props: Record<string, unknown> = {}) {
  return mount(ChangedRegionRail, {
    props: {
      regions: REGIONS,
      candidateUrl: "/images/candidate.png",
      imageWidth: 800,
      imageHeight: 600,
      ...props,
    },
  });
}

describe("ChangedRegionRail", () => {
  it("lists every changed region with its size and share", () => {
    const wrapper = mountRail();

    const items = wrapper.findAll(
      `[data-testid="${TEST_ID.changedRegionItem}"]`,
    );

    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("100 × 50 px");
    expect(items[0].text()).toContain("of the image");
    expect(
      wrapper.get(`[data-testid="${TEST_ID.changedRegionCount}"]`).text(),
    ).toBe("2 areas");
  });

  it("crops the candidate around each region", () => {
    const wrapper = mountRail();

    const crop = wrapper
      .findAll(`[data-testid="${TEST_ID.changedRegionItem}"]`)[0]
      .find('[style*="background-image"]');

    expect(crop.attributes("style")).toContain("/images/candidate.png");
    expect(crop.attributes("style")).toContain("background-size");
  });

  it("emits the index of the selected region", async () => {
    const wrapper = mountRail();

    await wrapper
      .findAll(`[data-testid="${TEST_ID.changedRegionItem}"]`)[1]
      .trigger("click");

    expect(wrapper.emitted("select")).toEqual([[1]]);
  });

  it("marks the active region", () => {
    const wrapper = mountRail({ activeIndex: 0 });

    const items = wrapper.findAll(
      `[data-testid="${TEST_ID.changedRegionItem}"]`,
    );

    expect(items[0].attributes("aria-pressed")).toBe("true");
    expect(items[1].attributes("aria-pressed")).toBe("false");
  });

  it("falls back to the pixel count without an image size", () => {
    const wrapper = mountRail({ imageWidth: 0, imageHeight: 0 });

    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.changedRegionItem}"]`)[0].text(),
    ).toContain("500 px");
  });
});
