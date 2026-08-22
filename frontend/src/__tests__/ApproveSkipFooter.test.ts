import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ApproveSkipFooter from "@/components/ApproveSkipFooter.vue";

describe("ApproveSkipFooter", () => {
  it("disables the approve button while an approval is in flight", () => {
    const wrapper = mount(ApproveSkipFooter, {
      props: { approved: false, isApproving: true },
    });

    expect(
      wrapper.find('[data-testid="approve-changes"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("disables the skip button while an approval is in flight", () => {
    const wrapper = mount(ApproveSkipFooter, {
      props: { approved: false, isApproving: true },
    });

    expect(
      wrapper.find('[data-testid="skip"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("keeps both buttons enabled when idle", () => {
    const wrapper = mount(ApproveSkipFooter, {
      props: { approved: false, isApproving: false },
    });

    expect(
      wrapper.find('[data-testid="approve-changes"]').attributes("disabled"),
    ).toBeUndefined();
    expect(
      wrapper.find('[data-testid="skip"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("hides the approve button once the comparison is approved", () => {
    const wrapper = mount(ApproveSkipFooter, {
      props: { approved: true, isApproving: false },
    });

    expect(wrapper.find('[data-testid="approve-changes"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="skip"]').text()).toBe("Back to project");
  });
});
