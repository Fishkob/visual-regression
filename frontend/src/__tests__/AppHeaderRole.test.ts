import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import AppHeader from "@/components/AppHeader.vue";
import { TEST_ID } from "@/lib/test-ids";
import type { CurrentUser } from "@/domains/auth/auth.model";

const { userRef } = vi.hoisted(() => ({
  userRef: { value: null as CurrentUser | null },
}));

vi.mock("@/composables/useAuth", () => ({
  useMeQuery: () => ({ data: ref(userRef.value) }),
  useLogout: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/composables/useTheme", () => ({
  useTheme: () => ({ theme: ref("light"), toggle: vi.fn() }),
}));

function mountHeader() {
  return mount(AppHeader, { global: { plugins: [] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  userRef.value = null;
});

describe("AppHeader role badge", () => {
  it("shows the username and the ADMIN role", () => {
    userRef.value = {
      username: "alice",
      role: "ADMIN",
      mustChangePassword: false,
    };

    const wrapper = mountHeader();

    expect(wrapper.get(`[data-testid="${TEST_ID.currentUser}"]`).text()).toBe(
      "alice",
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.currentUserRole}"]`).text(),
    ).toBe("ADMIN");
  });

  it.each(["MEMBER", "VIEWER"] as const)("shows the %s role", (role) => {
    userRef.value = {
      username: "bob",
      role,
      mustChangePassword: false,
    };

    const wrapper = mountHeader();

    expect(
      wrapper.get(`[data-testid="${TEST_ID.currentUserRole}"]`).text(),
    ).toBe(role);
  });

  it("renders the global search trigger", () => {
    const wrapper = mountHeader();

    expect(
      wrapper.find(`[data-testid="${TEST_ID.searchTrigger}"]`).exists(),
    ).toBe(true);
  });

  it("renders no user or role badge without a session", () => {
    const wrapper = mountHeader();

    expect(
      wrapper.find(`[data-testid="${TEST_ID.currentUser}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.currentUserRole}"]`).exists(),
    ).toBe(false);
  });
});
