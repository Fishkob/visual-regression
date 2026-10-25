import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import BulkApproveButton from "@/components/BulkApproveButton.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));

vi.mock("@/composables/useBulkApprove", () => ({
  useBulkApprove: () => ({ mutate: mockMutate, isPending: false }),
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
});
