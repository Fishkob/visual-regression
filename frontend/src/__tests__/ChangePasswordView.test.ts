import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import ChangePasswordView from "@/views/ChangePasswordView.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockChangePassword, mockLogout, mockMe } = vi.hoisted(() => ({
  mockChangePassword: vi.fn(),
  mockLogout: vi.fn(),
  mockMe: vi.fn(),
}));

vi.mock("@sdk", () => ({
  authControllerChangePassword: (...args: unknown[]) =>
    mockChangePassword(...args),
  authControllerLogout: (...args: unknown[]) => mockLogout(...args),
  authControllerMe: (...args: unknown[]) => mockMe(...args),
}));

const push = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return mount(ChangePasswordView, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  });
}

async function fill(
  wrapper: ReturnType<typeof mountView>,
  values: { current: string; next: string; confirm: string },
) {
  await wrapper
    .get(`[data-testid="${TEST_ID.changePasswordCurrent}"]`)
    .setValue(values.current);
  await wrapper
    .get(`[data-testid="${TEST_ID.changePasswordNew}"]`)
    .setValue(values.next);
  await wrapper
    .get(`[data-testid="${TEST_ID.changePasswordConfirm}"]`)
    .setValue(values.confirm);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChangePassword.mockResolvedValue({
    data: { username: "alice", role: "MEMBER", mustChangePassword: false },
  });
});

describe("ChangePasswordView", () => {
  it("renders the fields and keeps submit disabled until valid", async () => {
    const wrapper = mountView();

    expect(
      wrapper.find(`[data-testid="${TEST_ID.changePasswordView}"]`).exists(),
    ).toBe(true);
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.changePasswordSubmit}"]`)
        .attributes("disabled"),
    ).toBeDefined();
  });

  it("requires at least 8 characters", async () => {
    const wrapper = mountView();
    await fill(wrapper, {
      current: "temporary",
      next: "short",
      confirm: "short",
    });

    expect(wrapper.text()).toContain("Use at least 8 characters.");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.changePasswordSubmit}"]`)
        .attributes("disabled"),
    ).toBeDefined();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("requires the confirmation to match", async () => {
    const wrapper = mountView();
    await fill(wrapper, {
      current: "temporary",
      next: "a-long-secret",
      confirm: "another-secret",
    });

    expect(wrapper.text()).toContain("The new passwords do not match.");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.changePasswordSubmit}"]`)
        .attributes("disabled"),
    ).toBeDefined();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("submits the passwords and navigates to the inbox", async () => {
    const wrapper = mountView();
    await fill(wrapper, {
      current: "temporary",
      next: "a-long-secret",
      confirm: "a-long-secret",
    });

    const submit = wrapper.get(
      `[data-testid="${TEST_ID.changePasswordSubmit}"]`,
    );
    expect(submit.attributes("disabled")).toBeUndefined();
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockChangePassword).toHaveBeenCalledWith({
        body: {
          currentPassword: "temporary",
          newPassword: "a-long-secret",
        },
      }),
    );
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith({ name: "review-inbox" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Password changed");
  });

  it("shows the server message when the current password is wrong", async () => {
    mockChangePassword.mockResolvedValue({
      error: { message: "Current password is incorrect" },
    });
    const wrapper = mountView();
    await fill(wrapper, {
      current: "wrong",
      next: "a-long-secret",
      confirm: "a-long-secret",
    });

    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Current password is incorrect"),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
