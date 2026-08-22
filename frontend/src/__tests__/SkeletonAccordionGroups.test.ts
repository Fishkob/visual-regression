import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SkeletonAccordionGroups from "@/components/cards/SkeletonAccordionGroups.vue";

describe("SkeletonAccordionGroups", () => {
  it("renders 3 accordion card placeholders", () => {
    const wrapper = mount(SkeletonAccordionGroups);
    const cards = wrapper.findAll('[data-testid="skeleton-accordion-card"]');
    expect(cards.length).toBe(3);
  });

  it("renders 4 skeleton rows per card", () => {
    const wrapper = mount(SkeletonAccordionGroups);
    const rows = wrapper.findAll('[data-testid="skeleton-row"]');
    expect(rows.length).toBe(12); // 3 cards × 4 rows
  });

  it("renders header bar with badge placeholders", () => {
    const wrapper = mount(SkeletonAccordionGroups);
    const headers = wrapper.findAll('[data-testid="skeleton-card-header"]');
    expect(headers.length).toBe(3);
    expect(headers[0].find('[data-testid="skeleton-badge"]').exists()).toBe(
      true,
    );
  });
});
