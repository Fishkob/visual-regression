import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import InviteLinkDialog from "@/components/users/InviteLinkDialog.vue";
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
  return mount(InviteLinkDialog, {
    props: {
      open: true,
      username: "jane.doe",
      link: "https://vrt.example/invite/tok-1",
      expiresAt: "2026-11-16T10:00:00.000Z",
      title: "User created",
    },
    global: { stubs: { DialogPortal: { template: "<slot />" } } },
  });
}

describe("InviteLinkDialog", () => {
  it("names the account the link is for and shows the link itself", () => {
    const wrapper = mountDialog();
    const text = wrapper.text();

    expect(text).toContain("jane.doe");
    expect(wrapper.get(`[data-testid="${TEST_ID.inviteLinkUrl}"]`).text()).toBe(
      "https://vrt.example/invite/tok-1",
    );
  });

  it("copies the link to the clipboard", async () => {
    const wrapper = mountDialog();
    const copy = wrapper.get(`[data-testid="${TEST_ID.inviteLinkCopy}"]`);

    expect(copy.attributes("aria-label")).toBe(
      "Copy the one-time link to the clipboard",
    );
    await copy.trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("https://vrt.example/invite/tok-1");
    expect(copy.attributes("aria-label")).toBe("Copied");
  });
});
