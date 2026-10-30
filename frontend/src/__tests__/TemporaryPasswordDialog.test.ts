import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import TemporaryPasswordDialog from "@/components/users/TemporaryPasswordDialog.vue";
import { TEST_ID } from "@/lib/test-ids";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  // @ts-expect-error - removing the jsdom stub again
  delete navigator.clipboard;
});

function mountDialog() {
  return mount(TemporaryPasswordDialog, {
    props: {
      open: true,
      username: "jane.doe",
      password: "temp-pass-1",
      title: "User created",
    },
    global: { stubs: { DialogPortal: { template: "<slot />" } } },
  });
}

describe("TemporaryPasswordDialog", () => {
  it("names the account above the password", () => {
    const wrapper = mountDialog();
    const text = wrapper.text();

    expect(text).toContain("User: jane.doe");
    expect(text.indexOf("jane.doe")).toBeLessThan(text.indexOf("temp-pass-1"));
  });

  it("copies the password to the clipboard", async () => {
    const wrapper = mountDialog();
    const copy = wrapper.get(
      `[data-testid="${TEST_ID.temporaryPasswordCopy}"]`,
    );

    expect(copy.attributes("aria-label")).toBe("Copy password");
    await copy.trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("temp-pass-1");
    expect(copy.attributes("aria-label")).toBe("Copied");
  });
});
