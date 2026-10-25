import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { i18n } from "@/i18n";
import AppSidebar from "@/components/AppSidebar.vue";
import { TEST_ID } from "@/lib/test-ids";
import type { UserRole } from "@/domains/auth/auth.model";

const { roleRef } = vi.hoisted(() => ({
  roleRef: { value: "ADMIN" as UserRole },
}));

vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => {
    const role = roleRef.value;
    return {
      role: ref(role),
      isAdmin: role === "ADMIN",
      canWrite: role !== "VIEWER",
    };
  },
}));

vi.mock("@/composables/useReviewInbox", () => ({
  useReviewInboxCountQuery: () => ({ data: ref(0) }),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "review-inbox", path: "/" }),
  RouterLink: { template: "<a><slot /></a>" },
}));

const mounted: { unmount: () => void }[] = [];

function mountSidebar(role: UserRole) {
  roleRef.value = role;
  const wrapper = mount(AppSidebar, { global: { plugins: [i18n] } });
  mounted.push(wrapper);
  return wrapper;
}

function has(wrapper: ReturnType<typeof mountSidebar>, testId: string) {
  return wrapper.find(`[data-testid="${testId}"]`).exists();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("AppSidebar role visibility", () => {
  it("shows Users, API keys and Audit to an admin", () => {
    const wrapper = mountSidebar("ADMIN");

    expect(has(wrapper, TEST_ID.usersNavLink)).toBe(true);
    expect(has(wrapper, TEST_ID.navApiKeys)).toBe(true);
    expect(has(wrapper, TEST_ID.auditNavLink)).toBe(true);
    // The pages every role can open stay visible.
    expect(has(wrapper, TEST_ID.navInbox)).toBe(true);
    expect(has(wrapper, TEST_ID.navProjects)).toBe(true);
    expect(has(wrapper, TEST_ID.navGroups)).toBe(true);
    // Security is available to every signed-in role.
    expect(has(wrapper, TEST_ID.securityNavLink)).toBe(true);
  });

  it("hides the admin links from a member", () => {
    const wrapper = mountSidebar("MEMBER");

    expect(has(wrapper, TEST_ID.usersNavLink)).toBe(false);
    expect(has(wrapper, TEST_ID.navApiKeys)).toBe(false);
    expect(has(wrapper, TEST_ID.auditNavLink)).toBe(false);
    expect(has(wrapper, TEST_ID.navInbox)).toBe(true);
    expect(has(wrapper, TEST_ID.securityNavLink)).toBe(true);
  });

  it("hides the admin links from a viewer", () => {
    const wrapper = mountSidebar("VIEWER");

    expect(has(wrapper, TEST_ID.usersNavLink)).toBe(false);
    expect(has(wrapper, TEST_ID.navApiKeys)).toBe(false);
    expect(has(wrapper, TEST_ID.auditNavLink)).toBe(false);
    expect(has(wrapper, TEST_ID.navProjects)).toBe(true);
    expect(has(wrapper, TEST_ID.securityNavLink)).toBe(true);
  });
});
