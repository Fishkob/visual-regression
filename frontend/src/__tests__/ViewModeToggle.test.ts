import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ViewModeToggle from "@/components/ui/view-mode-toggle/ViewModeToggle.vue";
import { TEST_ID } from "@/lib/test-ids";

describe("ViewModeToggle", () => {
  it("exposes group semantics and the pressed state", () => {
    const wrapper = mount(ViewModeToggle, {
      props: { modelValue: "side-by-side" },
    });

    const group = wrapper.get('[role="group"]');
    expect(group.attributes("aria-label")).toBe("View mode");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.modeSidebyside}"]`)
        .attributes("aria-pressed"),
    ).toBe("true");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.modeDiff}"]`)
        .attributes("aria-pressed"),
    ).toBe("false");
  });

  it("moves the pressed state with the model", () => {
    const wrapper = mount(ViewModeToggle, {
      props: { modelValue: "diff-only" },
    });

    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.modeSidebyside}"]`)
        .attributes("aria-pressed"),
    ).toBe("false");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.modeDiff}"]`)
        .attributes("aria-pressed"),
    ).toBe("true");
  });

  it("emits update:modelValue when a mode is selected", async () => {
    const wrapper = mount(ViewModeToggle, {
      props: { modelValue: "side-by-side" },
    });

    await wrapper.get(`[data-testid="${TEST_ID.modeDiff}"]`).trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["diff-only"]]);
  });

  it("hides the diff mode when the diff is not available", () => {
    const wrapper = mount(ViewModeToggle, {
      props: { modelValue: "side-by-side", showDiff: false },
    });

    expect(wrapper.find(`[data-testid="${TEST_ID.modeDiff}"]`).exists()).toBe(
      false,
    );
  });

  it("shows all four modes when a diff is available", () => {
    const wrapper = mount(ViewModeToggle, {
      props: { modelValue: "side-by-side" },
    });

    for (const id of [
      TEST_ID.modeSidebyside,
      TEST_ID.modeDiff,
      TEST_ID.modeOverlay,
      TEST_ID.modeWipe,
    ]) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true);
    }
  });

  it("hides the overlay and wipe modes without a diff or when opted out", () => {
    const withoutDiff = mount(ViewModeToggle, {
      props: { modelValue: "side-by-side", showDiff: false },
    });

    expect(
      withoutDiff.find(`[data-testid="${TEST_ID.modeOverlay}"]`).exists(),
    ).toBe(false);
    expect(
      withoutDiff.find(`[data-testid="${TEST_ID.modeWipe}"]`).exists(),
    ).toBe(false);

    const withoutLayered = mount(ViewModeToggle, {
      props: { modelValue: "side-by-side", showLayered: false },
    });

    expect(
      withoutLayered.find(`[data-testid="${TEST_ID.modeOverlay}"]`).exists(),
    ).toBe(false);
    expect(
      withoutLayered.find(`[data-testid="${TEST_ID.modeWipe}"]`).exists(),
    ).toBe(false);
    expect(
      withoutLayered.find(`[data-testid="${TEST_ID.modeDiff}"]`).exists(),
    ).toBe(true);
  });

  it("offers the blink mode only when both pictures exist", () => {
    const withoutBlink = mount(ViewModeToggle, {
      props: { modelValue: "side-by-side" },
    });
    expect(
      withoutBlink.find(`[data-testid="${TEST_ID.modeBlink}"]`).exists(),
    ).toBe(false);

    const withBlink = mount(ViewModeToggle, {
      props: { modelValue: "side-by-side", showBlink: true },
    });
    expect(
      withBlink.find(`[data-testid="${TEST_ID.modeBlink}"]`).exists(),
    ).toBe(true);
  });
});
