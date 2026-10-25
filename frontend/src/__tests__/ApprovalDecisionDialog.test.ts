import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ApprovalDecisionDialog from "@/components/approvals/ApprovalDecisionDialog.vue";
import { Select } from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function mountDialog() {
  return mount(ApprovalDecisionDialog, {
    props: { open: true },
    global: { stubs: { DialogPortal: { template: "<slot />" } } },
  });
}

describe("ApprovalDecisionDialog", () => {
  it("emits the selected reason and note", async () => {
    const wrapper = mountDialog();

    const select = wrapper
      .findAllComponents(Select)
      .find((component) =>
        component.find(`[data-testid="${TEST_ID.approveReason}"]`).exists(),
      );
    if (!select) throw new Error("reason select not found");
    select.vm.$emit("update:modelValue", "FLAKE");

    await wrapper
      .get(`[data-testid="${TEST_ID.approveNote}"]`)
      .setValue("Known flake while the fixture loads");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("confirm")).toContainEqual([
      { reason: "FLAKE", note: "Known flake while the fixture loads" },
    ]);
  });

  it("emits no reason when the default is kept", async () => {
    const wrapper = mountDialog();
    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("confirm")).toContainEqual([{}]);
  });
});
