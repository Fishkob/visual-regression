import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import BulkApproveButton from "@/components/BulkApproveButton.vue";
import { TEST_ID } from "@/lib/test-ids";
import type { UserRole } from "@/domains/auth/auth.model";

const { mockMutate, roleRef } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  roleRef: { value: "MEMBER" as UserRole },
}));

vi.mock("@/composables/useBulkApprove", () => ({
  useBulkApprove: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: roleRef.value !== "VIEWER" }),
}));

const ConfirmDialogStub = {
  template:
    '<button data-testid="confirm-stub" @click="$emit(\'confirm\')">confirm</button>',
};

function mountButton(props: {
  projectName: string;
  testName: string;
  branch?: string;
  disabled?: boolean;
}) {
  return mount(BulkApproveButton, {
    props,
    global: { stubs: { ConfirmDialog: ConfirmDialogStub } },
  });
}

describe("BulkApproveButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleRef.value = "MEMBER";
  });

  it("confirms and dispatches the bulk approval", async () => {
    const wrapper = mountButton({
      projectName: "checkout",
      testName: "login",
      branch: "feature/x",
    });

    await wrapper
      .get(`[data-testid="${TEST_ID.bulkApprove}"]`)
      .trigger("click");
    await wrapper.get('[data-testid="confirm-stub"]').trigger("click");

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("disables the trigger while a single approval is in flight", () => {
    const wrapper = mountButton({
      projectName: "checkout",
      testName: "login",
      disabled: true,
    });

    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.bulkApprove}"]`)
        .attributes("disabled"),
    ).toBeDefined();
  });

  it("renders no approve control for a read-only viewer", () => {
    roleRef.value = "VIEWER";

    const wrapper = mountButton({
      projectName: "checkout",
      testName: "login",
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.bulkApprove}"]`).exists(),
    ).toBe(false);
  });

  it("keeps the trigger for a member", () => {
    const wrapper = mountButton({
      projectName: "checkout",
      testName: "login",
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.bulkApprove}"]`).exists(),
    ).toBe(true);
  });
});
