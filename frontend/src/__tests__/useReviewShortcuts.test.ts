import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { useReviewShortcuts } from "@/composables/useReviewShortcuts";

function mountShortcuts(options: Parameters<typeof useReviewShortcuts>[0]) {
  return mount(
    defineComponent({
      setup() {
        useReviewShortcuts(options);
        return () => null;
      },
    }),
  );
}

describe("useReviewShortcuts", () => {
  it("maps a, s, and Escape to approve, skip, and back", () => {
    const onApprove = vi.fn();
    const onSkip = vi.fn();
    const onBack = vi.fn();
    const wrapper = mountShortcuts({ onApprove, onSkip, onBack });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("suppresses shortcuts inside form controls", () => {
    const onApprove = vi.fn();
    const onSkip = vi.fn();
    const onBack = vi.fn();
    const wrapper = mountShortcuts({ onApprove, onSkip, onBack });

    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    document.body.append(input, textarea);

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", bubbles: true }),
    );

    expect(onApprove).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();

    input.remove();
    textarea.remove();
    wrapper.unmount();
  });

  it("ignores repeated keydown events", () => {
    const onApprove = vi.fn();
    const wrapper = mountShortcuts({
      onApprove,
      onSkip: vi.fn(),
      onBack: vi.fn(),
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", repeat: true }),
    );

    expect(onApprove).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("ignores events already handled by another listener", () => {
    const onApprove = vi.fn();
    const wrapper = mountShortcuts({
      onApprove,
      onSkip: vi.fn(),
      onBack: vi.fn(),
    });

    const event = new KeyboardEvent("keydown", {
      key: "a",
      cancelable: true,
    });
    event.preventDefault();
    window.dispatchEvent(event);

    expect(onApprove).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("suppresses shortcuts while a dialog is open", () => {
    const onApprove = vi.fn();
    const onSkip = vi.fn();
    const onBack = vi.fn();
    const wrapper = mountShortcuts({ onApprove, onSkip, onBack });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    document.body.appendChild(dialog);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onApprove).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();

    dialog.remove();
    wrapper.unmount();
  });

  it("ignores shortcuts with modifier keys", () => {
    const onApprove = vi.fn();
    const wrapper = mountShortcuts({
      onApprove,
      onSkip: vi.fn(),
      onBack: vi.fn(),
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", metaKey: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", altKey: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", shiftKey: true }),
    );

    expect(onApprove).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("honours the enabled guard", () => {
    const onApprove = vi.fn();
    const enabled = { value: false };
    const wrapper = mountShortcuts({
      onApprove,
      onSkip: vi.fn(),
      onBack: vi.fn(),
      enabled: () => enabled.value,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(onApprove).not.toHaveBeenCalled();

    enabled.value = true;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(onApprove).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("allows Escape while approve and skip are disabled", () => {
    const onBack = vi.fn();
    const wrapper = mountShortcuts({
      onApprove: vi.fn(),
      onSkip: vi.fn(),
      onBack,
      enabled: false,
      canBack: true,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onBack).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("stops listening after unmount", () => {
    const onApprove = vi.fn();
    const wrapper = mountShortcuts({
      onApprove,
      onSkip: vi.fn(),
      onBack: vi.fn(),
    });

    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    expect(onApprove).not.toHaveBeenCalled();
  });
});
