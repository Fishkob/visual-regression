import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import InviteView from "@/views/InviteView.vue";
import type { InvitePreviewDto } from "@sdk";
import { TEST_ID } from "@/lib/test-ids";

const { mockPreview, mockReveal } = vi.hoisted(() => ({
  mockPreview: vi.fn(),
  mockReveal: vi.fn(),
}));

vi.mock("@sdk", () => ({
  publicUserInviteControllerPreview: (...args: unknown[]) =>
    mockPreview(...args),
  publicUserInviteControllerReveal: (...args: unknown[]) => mockReveal(...args),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { token: "invite-token" } }),
}));

function preview(overrides: Partial<InvitePreviewDto> = {}): InvitePreviewDto {
  return {
    username: "jane",
    role: "MEMBER",
    expiresAt: "2026-11-16T10:00:00.000Z",
    status: "pending",
    ...overrides,
  };
}

function statusResponse(status: number) {
  return { error: { message: "nope" }, response: { status } };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const wrapper = mount(InviteView, {
    global: {
      stubs: {
        RouterLink: { props: ["to"], template: "<a><slot /></a>" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPreview.mockResolvedValue({ data: preview() });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("InviteView", () => {
  it("names the account the link belongs to and offers the one reveal", async () => {
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteReveal}"]`).exists(),
      ).toBe(true),
    );
    expect(mockPreview).toHaveBeenCalledWith({
      path: { token: "invite-token" },
    });
    expect(
      wrapper.get(`[data-testid="${TEST_ID.inviteView}"]`).text(),
    ).toContain("jane");
  });

  it("reveals the password once and replaces the button with it", async () => {
    mockReveal.mockResolvedValue({
      data: { username: "jane", temporaryPassword: "temp-pass-1" },
    });
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteReveal}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.inviteReveal}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.invitePassword}"]`).exists(),
      ).toBe(true),
    );
    expect(mockReveal).toHaveBeenCalledWith({
      path: { token: "invite-token" },
    });
    expect(
      wrapper.get(`[data-testid="${TEST_ID.invitePassword}"]`).text(),
    ).toBe("temp-pass-1");
    // The link is spent: the page must not offer a second reveal.
    expect(
      wrapper.find(`[data-testid="${TEST_ID.inviteReveal}"]`).exists(),
    ).toBe(false);
  });

  it("explains a link that was already used instead of offering the button", async () => {
    mockPreview.mockResolvedValue({ data: preview({ status: "used" }) });
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteStatus}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.inviteStatus}"]`).text(),
    ).toContain("already been used");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.inviteReveal}"]`).exists(),
    ).toBe(false);
  });

  it("explains an expired link", async () => {
    mockPreview.mockResolvedValue({ data: preview({ status: "expired" }) });
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteStatus}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.inviteStatus}"]`).text(),
    ).toContain("expired");
  });

  it("reports a token no invite carries as an invalid link", async () => {
    mockPreview.mockResolvedValue(statusResponse(404));
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteStatus}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.inviteStatus}"]`).text(),
    ).toContain("not valid");
  });

  // A 410 on the reveal is the race the API guards against: the link was still
  // pending when the page loaded and somebody else spent it first.
  it("turns a 410 on the reveal into the used state", async () => {
    mockReveal.mockResolvedValue(statusResponse(410));
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteReveal}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.inviteReveal}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteStatus}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.inviteStatus}"]`).text(),
    ).toContain("already been used");
  });

  it("keeps the reveal button when the API fails without a state", async () => {
    mockReveal.mockResolvedValue(statusResponse(500));
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteReveal}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.inviteReveal}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteError}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.find(`[data-testid="${TEST_ID.invitePassword}"]`).exists(),
    ).toBe(false);
  });
});
