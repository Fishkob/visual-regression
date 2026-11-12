import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { TEST_ID } from "@/lib/test-ids";

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ConfirmDialog, {
    props: { open: true, ...props },
    global: {
      stubs: { AlertDialogPortal: { template: "<slot />" } },
    },
  });
}

function confirmButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`);
}

function typedInput(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.find(`[data-testid="${TEST_ID.dialogRequiredText}"]`);
}

describe("ConfirmDialog typed confirmation", () => {
  it("keeps the confirm button enabled when no text is required", () => {
    const wrapper = mountDialog({ confirmText: "Delete" });

    expect(typedInput(wrapper).exists()).toBe(false);
    expect(confirmButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("requires the exact phrase before confirming", async () => {
    const wrapper = mountDialog({
      requiredText: "checkout-ui",
      requiredTextLabel: "Type the project name checkout-ui to confirm.",
    });

    expect(typedInput(wrapper).exists()).toBe(true);
    expect(confirmButton(wrapper).attributes("disabled")).toBeDefined();

    await typedInput(wrapper).setValue("checkout");
    expect(confirmButton(wrapper).attributes("disabled")).toBeDefined();

    await typedInput(wrapper).setValue("checkout-ui");
    expect(confirmButton(wrapper).attributes("disabled")).toBeUndefined();

    await confirmButton(wrapper).trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it("clears the typed text when the dialog is reopened", async () => {
    const wrapper = mountDialog({ requiredText: "checkout-ui" });

    await typedInput(wrapper).setValue("checkout-ui");
    expect(confirmButton(wrapper).attributes("disabled")).toBeUndefined();

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });

    expect((typedInput(wrapper).element as HTMLInputElement).value).toBe("");
    expect(confirmButton(wrapper).attributes("disabled")).toBeDefined();
  });
});
