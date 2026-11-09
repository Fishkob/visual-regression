import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import UsersView from "@/views/UsersView.vue";
import { Select } from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockCreate, mockUpdate, mockReset, meRef } = vi.hoisted(
  () => ({
    mockList: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockReset: vi.fn(),
    meRef: { value: null as { username: string } | null },
  }),
);

vi.mock("@sdk", () => ({
  usersControllerList: (...args: unknown[]) => mockList(...args),
  usersControllerCreate: (...args: unknown[]) => mockCreate(...args),
  usersControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
  usersControllerResetPassword: (...args: unknown[]) => mockReset(...args),
}));

vi.mock("@/composables/useAuth", () => ({
  useMeQuery: () => ({ data: { value: meRef.value } }),
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
    createdAt: minutesAgo(180),
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function matchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

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
        DropdownMenuPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

type MountedView = ReturnType<typeof mountView>;

async function waitForRows(wrapper: MountedView, count: number) {
  await vi.waitFor(() =>
    expect(wrapper.findAll(`[data-testid="${TEST_ID.userRow}"]`)).toHaveLength(
      count,
    ),
  );
}

function rowFor(wrapper: MountedView, username: string) {
  const row = wrapper
    .findAll(`[data-testid="${TEST_ID.userRow}"]`)
    .find((candidate) => candidate.text().includes(username));
  if (!row) throw new Error(`No row for ${username}`);
  return row;
}

// The row's actions live behind one menu, so every action test opens it first.
async function openRowMenu(wrapper: MountedView, username: string) {
  const trigger = rowFor(wrapper, username).get(
    `[data-testid="${TEST_ID.userActions}"]`,
  );
  await trigger.trigger("pointerdown");
  await trigger.trigger("click");
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.userReset}"]`).length,
    ).toBeGreaterThan(0),
  );
}

async function choose(wrapper: MountedView, testId: string) {
  await wrapper.get(`[data-testid="${testId}"]`).trigger("click");
}

beforeEach(() => {
  vi.clearAllMocks();
  matchMedia(true);
  meRef.value = { username: "alice" };
  mockList.mockResolvedValue({
    data: [
      userDto(),
      userDto({
        id: "u-2",
        username: "bob",
        role: "VIEWER",
        isActive: false,
        deactivatedAt: minutesAgo(120),
        createdAt: minutesAgo(120),
      }),
      userDto({
        id: "u-3",
        username: "carol",
        role: "MEMBER",
        createdAt: minutesAgo(30),
      }),
    ],
  });
  mockCreate.mockResolvedValue({
    data: {
      user: userDto({ id: "u-4", username: "jane", role: "ADMIN" }),
      invite: {
        token: "create-token",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    },
  });
  mockUpdate.mockResolvedValue({ data: userDto({ isActive: false }) });
  mockReset.mockResolvedValue({
    data: {
      invite: {
        token: "reset-token",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    },
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  matchMedia(true);
});

describe("UsersView", () => {
  it("lists users newest first with their role, status and creator", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.userRow}"]`);
    expect(rows[0].text()).toContain("carol");
    expect(rows[2].text()).toContain("alice");

    const alice = rowFor(wrapper, "alice");
    expect(alice.text()).toContain("by bootstrap");
    expect(alice.get(`[data-testid="${TEST_ID.userRole}"]`).text()).toBe(
      "ADMIN",
    );
    expect(alice.get(`[data-testid="${TEST_ID.userActive}"]`).text()).toBe(
      "Active",
    );

    const bob = rowFor(wrapper, "bob");
    expect(bob.get(`[data-testid="${TEST_ID.userRole}"]`).text()).toBe(
      "VIEWER",
    );
    expect(bob.get(`[data-testid="${TEST_ID.userActive}"]`).text()).toBe(
      "Inactive",
    );
  });

  it("marks the signed-in account and blocks its own actions", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    expect(
      rowFor(wrapper, "alice")
        .get(`[data-testid="${TEST_ID.userSelf}"]`)
        .text(),
    ).toBe("You");
    expect(
      rowFor(wrapper, "carol")
        .find(`[data-testid="${TEST_ID.userSelf}"]`)
        .exists(),
    ).toBe(false);

    await openRowMenu(wrapper, "alice");

    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.userDeactivate}"]`)
        .attributes("data-disabled"),
    ).toBeDefined();
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.userReset}"]`)
        .attributes("data-disabled"),
    ).toBeDefined();
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.userChangeRole}"]`)
        .attributes("data-disabled"),
    ).toBeDefined();
    expect(
      wrapper.get(`[data-testid="${TEST_ID.userBlockedReason}"]`).text(),
    ).toContain("You cannot deactivate your own account.");
  });

  it("leaves the actions of another member available", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    await openRowMenu(wrapper, "carol");

    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.userChangeRole}"]`)
        .attributes("data-disabled"),
    ).toBeUndefined();
    expect(
      wrapper.find(`[data-testid="${TEST_ID.userBlockedReason}"]`).exists(),
    ).toBe(false);
  });

  it("changes a user's role", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    await openRowMenu(wrapper, "carol");
    await choose(wrapper, TEST_ID.userChangeRole);

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.changeRoleSelect}"]`).exists(),
      ).toBe(true),
    );
    wrapper.getComponent(Select).vm.$emit("update:modelValue", "ADMIN");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { id: "u-3" },
        body: { role: "ADMIN" },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Role changed"),
    );
  });

  it("creates a user and hands over a one-time link instead of the password", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    await choose(wrapper, TEST_ID.userCreate);

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.createUserUsername}"]`).exists(),
      ).toBe(true),
    );
    // Nothing is marked invalid before the admin has typed.
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.createUserUsername}"]`)
        .attributes("aria-invalid"),
    ).toBe("false");

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
        wrapper.find(`[data-testid="${TEST_ID.inviteLinkDialog}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.inviteLinkUrl}"]`).text(),
    ).toContain("/invite/create-token");
    // The reveal belongs to the person holding the link: nothing on the admin's
    // side renders a password.
    expect(wrapper.find('[data-testid^="temporary-password"]').exists()).toBe(
      false,
    );
  });

  it("resets a password after confirmation and issues a fresh link", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    await openRowMenu(wrapper, "carol");
    await choose(wrapper, TEST_ID.userReset);

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await choose(wrapper, TEST_ID.dialogConfirm);

    await vi.waitFor(() =>
      expect(mockReset).toHaveBeenCalledWith({ path: { id: "u-3" } }),
    );
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.inviteLinkDialog}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.inviteLinkUrl}"]`).text(),
    ).toContain("/invite/reset-token");
  });

  it("deactivates an active user after confirmation", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    await openRowMenu(wrapper, "carol");
    await choose(wrapper, TEST_ID.userDeactivate);

    await vi.waitFor(() =>
      expect(
        wrapper.get(`[data-testid="${TEST_ID.dialogDescription}"]`).text(),
      ).toContain("Deactivating carol"),
    );
    await choose(wrapper, TEST_ID.dialogConfirm);

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { id: "u-3" },
        body: { isActive: false },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("User deactivated"),
    );
  });

  it("reactivates an inactive user", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    await openRowMenu(wrapper, "bob");
    await choose(wrapper, TEST_ID.userDeactivate);

    await vi.waitFor(() =>
      expect(
        wrapper.get(`[data-testid="${TEST_ID.dialogDescription}"]`).text(),
      ).toContain("Reactivating bob"),
    );
    await choose(wrapper, TEST_ID.dialogConfirm);

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { id: "u-2" },
        body: { isActive: true },
      }),
    );
  });

  it("filters the list by username", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    expect(wrapper.get(`[data-testid="${TEST_ID.userCount}"]`).text()).toBe(
      "3 users",
    );

    await wrapper.get(`[data-testid="${TEST_ID.userSearch}"]`).setValue("car");

    expect(wrapper.get(`[data-testid="${TEST_ID.userCount}"]`).text()).toBe(
      "1 of 3 users",
    );
    expect(wrapper.findAll(`[data-testid="${TEST_ID.userRow}"]`)).toHaveLength(
      1,
    );
    expect(rowFor(wrapper, "carol").text()).toContain("carol");

    await wrapper.get(`[data-testid="${TEST_ID.userSearch}"]`).setValue("zzz");

    expect(wrapper.findAll(`[data-testid="${TEST_ID.userRow}"]`)).toHaveLength(
      0,
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.userNoMatches}"]`).text(),
    ).toContain("No account matches");
  });

  it("renders cards instead of the table on a phone", async () => {
    matchMedia(false);
    const wrapper = mountView();
    await waitForRows(wrapper, 3);

    expect(wrapper.find("table").exists()).toBe(false);
    expect(rowFor(wrapper, "alice").text()).toContain("Active");
  });
});
