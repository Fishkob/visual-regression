import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ComparisonVariantStrip from "@/components/detail-panels/ComparisonVariantStrip.vue";
import { TEST_ID } from "@/lib/test-ids";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";

const VARIANTS: VariantSummary[] = [
  {
    viewport: "1920x1080",
    browser: "Chrome",
    environment: "staging",
    status: "PENDING_APPROVAL",
    baselineUrl: "/images/desktop.png",
    candidateUrl: "/images/desktop-current.png",
    mismatchPixelCount: 157,
    baselineInherited: false,
  },
  {
    viewport: "768x1024",
    browser: "Chrome",
    environment: "staging",
    status: "UNCHANGED",
    baselineUrl: "/images/tablet.png",
    baselineInherited: false,
  },
];

function mountStrip(props: Record<string, unknown> = {}) {
  return mount(ComparisonVariantStrip, {
    props: { variants: VARIANTS, ...props },
  });
}

describe("ComparisonVariantStrip", () => {
  it("lists the sibling variants with their viewport", () => {
    const wrapper = mountStrip();

    const items = wrapper.findAll(
      `[data-testid="${TEST_ID.variantStripItem}"]`,
    );

    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("1920x1080");
    expect(items[1].text()).toContain("768x1024");
    // Both tiles are Chrome, so the browser would be repeated noise here.
    expect(items[0].text()).not.toContain("Chrome");
    expect(items[0].attributes("aria-label")).toBe(
      "1920x1080, Chrome, staging",
    );
  });

  it("names the browser when the siblings share a resolution", () => {
    const wrapper = mountStrip({
      variants: [
        { ...VARIANTS[0], viewport: "1920x1080", browser: "Chrome" },
        { ...VARIANTS[1], viewport: "1920x1080", browser: "Firefox" },
      ],
    });

    const items = wrapper.findAll(
      `[data-testid="${TEST_ID.variantStripItem}"]`,
    );

    // Same resolution, different browser: the browser is the only thing that
    // tells the two entries apart, so it carries the label and the constant
    // resolution does not get repeated on every tile.
    expect(items[0].text()).toContain("Chrome");
    expect(items[1].text()).toContain("Firefox");
    expect(items[0].text()).not.toContain("1920x1080");
  });

  it("names both dimensions when the siblings differ in both", () => {
    const wrapper = mountStrip({
      variants: [
        { ...VARIANTS[0], viewport: "1920x1080", browser: "Chrome" },
        { ...VARIANTS[0], viewport: "1920x1080", browser: "Firefox" },
        { ...VARIANTS[1], viewport: "1366x768", browser: "Chrome" },
      ],
    });

    const items = wrapper.findAll(
      `[data-testid="${TEST_ID.variantStripItem}"]`,
    );

    expect(items[0].text()).toContain("1920x1080 · Chrome");
    expect(items[1].text()).toContain("1920x1080 · Firefox");
    expect(items[2].text()).toContain("1366x768 · Chrome");
  });

  it("stays out of the page when the test has one variant", () => {
    const wrapper = mountStrip({ variants: [VARIANTS[0]] });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.variantStrip}"]`).exists(),
    ).toBe(false);
  });

  it("marks the shown variant", () => {
    const wrapper = mountStrip({
      active: {
        viewport: "768x1024",
        browser: "Chrome",
        environment: "staging",
      },
    });

    const items = wrapper.findAll(
      `[data-testid="${TEST_ID.variantStripItem}"]`,
    );

    expect(items[1].attributes("aria-current")).toBe("true");
    expect(items[0].attributes("aria-current")).toBeUndefined();
  });

  it("emits the picked variant", async () => {
    const wrapper = mountStrip();

    await wrapper
      .findAll(`[data-testid="${TEST_ID.variantStripItem}"]`)[1]
      .trigger("click");

    expect(wrapper.emitted("select")).toEqual([[VARIANTS[1]]]);
  });

  it("colours the status dot by review state", () => {
    const wrapper = mountStrip();

    const dots = wrapper.findAll(
      `[data-testid="${TEST_ID.variantStripItem}"] .rounded-full`,
    );

    expect(dots[0].classes()).toContain("bg-status-warning");
    expect(dots[1].classes()).toContain("bg-status-success");
  });
});
