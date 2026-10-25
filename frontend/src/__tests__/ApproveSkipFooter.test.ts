import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ApproveSkipFooter from "@/components/ApproveSkipFooter.vue";
import { TEST_ID } from "@/lib/test-ids";
import type { UserRole } from "@/domains/auth/auth.model";

const { roleRef } = vi.hoisted(() => ({
  roleRef: { value: "MEMBER" as UserRole },
}));

vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({
    canWrite: roleRef.value !== "VIEWER",
  }),
}));

beforeEach(() => {
  roleRef.value = "MEMBER";
});

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
    expect(
      wrapper.find(`[data-testid="${TEST_ID.backToProject}"]`).text(),
    ).toBe("Back to project");
  });

  it("hides the approve button for a read-only viewer", () => {
    roleRef.value = "VIEWER";

    const wrapper = mount(ApproveSkipFooter, {
      props: { approved: false, isApproving: false },
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.approveChanges}"]`).exists(),
    ).toBe(false);
    // A viewer can still walk the queue.
    expect(wrapper.find(`[data-testid="${TEST_ID.skip}"]`).exists()).toBe(true);
  });

  it("keeps the approve button for a member", () => {
    roleRef.value = "MEMBER";

    const wrapper = mount(ApproveSkipFooter, {
      props: { approved: false, isApproving: false },
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.approveChanges}"]`).exists(),
    ).toBe(true);
  });
});
