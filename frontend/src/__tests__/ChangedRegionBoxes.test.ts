import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChangedRegionBoxes from "@/components/detail-panels/ChangedRegionBoxes.vue";
import { TEST_ID } from "@/lib/test-ids";

const REGIONS = [
  { x: 10, y: 20, width: 100, height: 50, pixelCount: 500 },
  { x: 300, y: 400, width: 20, height: 20, pixelCount: 40 },
];

function mountBoxes(props: Record<string, unknown> = {}) {
  return mount(ChangedRegionBoxes, {
    props: {
      regions: REGIONS,
      imageWidth: 800,
      imageHeight: 600,
      ...props,
    },
  });
}

describe("ChangedRegionBoxes", () => {
  it("positions a box from the region's share of the image", () => {
    const wrapper = mountBoxes();

    const boxes = wrapper.findAll(
      `[data-testid="${TEST_ID.changedRegionBox}"]`,
    );

    expect(boxes).toHaveLength(2);
    expect(boxes[0].attributes("style")).toContain("left: 1.25%");
    expect(boxes[0].attributes("style")).toContain("top: 3.33");
    expect(boxes[0].attributes("style")).toContain("width: 12.5%");
    expect(boxes[0].attributes("style")).toContain("height: 8.33");
  });

  it("numbers the boxes in list order", () => {
    const wrapper = mountBoxes();

    const labels = wrapper
      .findAll(`[data-testid="${TEST_ID.changedRegionBox}"]`)
      .map((box) => box.text());

    expect(labels).toEqual(["1", "2"]);
  });

  it("emits the index of the clicked box", async () => {
    const wrapper = mountBoxes();

    await wrapper
      .findAll(`[data-testid="${TEST_ID.changedRegionBox}"]`)[1]
      .trigger("click");

    expect(wrapper.emitted("select")).toEqual([[1]]);
  });

  it("marks the active box and stays out of the tab order", () => {
    const wrapper = mountBoxes({ activeIndex: 1 });

    const boxes = wrapper.findAll(
      `[data-testid="${TEST_ID.changedRegionBox}"]`,
    );

    expect(boxes[1].attributes("data-active")).toBe("true");
    expect(boxes[0].attributes("data-active")).toBeUndefined();
    expect(boxes[0].attributes("tabindex")).toBe("-1");
    expect(boxes[0].attributes("aria-hidden")).toBe("true");
  });

  it("falls back to one pixel instead of dividing by zero", () => {
    const wrapper = mountBoxes({ imageWidth: 0, imageHeight: 0 });

    expect(
      wrapper
        .findAll(`[data-testid="${TEST_ID.changedRegionBox}"]`)[0]
        .attributes("style"),
    ).toContain("width: 10000%");
  });
});
