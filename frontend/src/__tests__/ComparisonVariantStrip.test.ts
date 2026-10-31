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
    expect(items[0].attributes("aria-label")).toBe(
      "1920x1080, Chrome, staging",
    );
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
