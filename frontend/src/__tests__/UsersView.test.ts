import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import UsersView from "@/views/UsersView.vue";
import { Select } from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockCreate, mockUpdate, mockReset } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockReset: vi.fn(),
}));

vi.mock("@sdk", () => ({
  usersControllerList: (...args: unknown[]) => mockList(...args),
  usersControllerCreate: (...args: unknown[]) => mockCreate(...args),
  usersControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
  usersControllerResetPassword: (...args: unknown[]) => mockReset(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function userDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    username: "alice",
    role: "ADMIN",
    isActive: true,
    mustChangePassword: false,
    deactivatedAt: null,
    createdBy: "bootstrap",
    createdAt: minutesAgo(60),
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(UsersView, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        DialogPortal: { template: "<slot />" },
        SelectPortal: { template: "<slot />" },
        AlertDialogPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForRows(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(wrapper.findAll(`[data-testid="${TEST_ID.userRow}"]`)).toHaveLength(
      count,
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({
    data: [
      userDto(),
      userDto({
        id: "u-2",
        username: "bob",
        role: "VIEWER",
        isActive: false,
        deactivatedAt: minutesAgo(5),
      }),
    ],
  });
  mockCreate.mockResolvedValue({
    data: {
      user: userDto({ id: "u-3", username: "jane", role: "ADMIN" }),
      temporaryPassword: "temp-pass-1",
    },
  });
  mockUpdate.mockResolvedValue({ data: userDto({ isActive: false }) });
  mockReset.mockResolvedValue({ data: { temporaryPassword: "reset-pass" } });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("UsersView", () => {
  it("lists users with their role, status and creator", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.userRow}"]`);
    expect(rows[0].text()).toContain("alice");
    expect(rows[0].text()).toContain("bootstrap");
    expect(rows[0].get(`[data-testid="${TEST_ID.userRole}"]`).text()).toBe(
      "ADMIN",
    );
    expect(rows[0].get(`[data-testid="${TEST_ID.userActive}"]`).text()).toBe(
      "Active",
    );

    expect(rows[1].get(`[data-testid="${TEST_ID.userRole}"]`).text()).toBe(
      "VIEWER",
    );
    expect(rows[1].get(`[data-testid="${TEST_ID.userActive}"]`).text()).toBe(
      "Inactive",
    );
  });

  it("creates a user and reveals the one-time temporary password", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    await wrapper.get(`[data-testid="${TEST_ID.userCreate}"]`).trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.createUserUsername}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.createUserUsername}"]`)
      .setValue("jane");
    wrapper.getComponent(Select).vm.$emit("update:modelValue", "ADMIN");

    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        body: { username: "jane", role: "ADMIN" },
      }),
    );
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.temporaryPasswordDialog}"]`)
          .exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.temporaryPasswordValue}"]`).text(),
    ).toBe("temp-pass-1");
  });

  it("resets a password after confirmation and reveals the new one", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    await wrapper
      .findAll(`[data-testid="${TEST_ID.userReset}"]`)[0]
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockReset).toHaveBeenCalledWith({ path: { id: "u-1" } }),
    );
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.temporaryPasswordDialog}"]`)
          .exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.temporaryPasswordValue}"]`).text(),
    ).toBe("reset-pass");
  });

  it("deactivates an active user after confirmation", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    await wrapper
      .findAll(`[data-testid="${TEST_ID.userDeactivate}"]`)[0]
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.get(`[data-testid="${TEST_ID.dialogDescription}"]`).text(),
      ).toContain("Deactivating alice"),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { id: "u-1" },
        body: { isActive: false },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("User deactivated"),
    );
  });

  it("reactivates an inactive user", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    await wrapper
      .findAll(`[data-testid="${TEST_ID.userDeactivate}"]`)[1]
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.get(`[data-testid="${TEST_ID.dialogDescription}"]`).text(),
      ).toContain("Reactivating bob"),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { id: "u-2" },
        body: { isActive: true },
      }),
    );
  });
});
