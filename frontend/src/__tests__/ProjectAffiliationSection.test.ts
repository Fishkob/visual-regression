import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { i18n } from "@/i18n";
import ProjectAffiliationSection from "@/components/projects/ProjectAffiliationSection.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockAssign, mockSetVisibility } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockAssign: vi.fn(),
  mockSetVisibility: vi.fn(),
}));

vi.mock("@sdk", () => ({
  teamsControllerList: (...args: unknown[]) => mockList(...args),
  projectTeamControllerAssign: (...args: unknown[]) => mockAssign(...args),
  projectVisibilityControllerUpdate: (...args: unknown[]) =>
    mockSetVisibility(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const TEAMS_RESPONSE = [
  {
    id: "team-storefront",
    name: "Storefront",
    createdBy: "admin",
    createdAt: "2026-10-20T10:00:00.000Z",
    members: [],
    projects: [{ id: "p-1", name: "checkout-ui" }],
  },
  {
    id: "team-backoffice",
    name: "Backoffice",
    createdBy: "admin",
    createdAt: "2026-10-20T10:00:00.000Z",
    members: [],
    projects: [],
  },
];

function mountSection(props: {
  groupName?: string | null;
  teamId?: string;
  teamName?: string;
  isShared?: boolean;
  canManageTeam?: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return mount(ProjectAffiliationSection, {
    props: {
      projectName: "checkout-ui",
      groupName: "Customer-facing",
      teamId: "team-storefront",
      teamName: "Storefront",
      isShared: false,
      canManageTeam: false,
      ...props,
    },
    global: { plugins: [i18n, [VueQueryPlugin, { queryClient }]] },
  });
}

describe("ProjectAffiliationSection", () => {
  beforeEach(() => {
    mockList.mockResolvedValue({ data: TEAMS_RESPONSE });
    mockAssign.mockResolvedValue({
      data: {
        projectId: "p-1",
        projectName: "checkout-ui",
        teamId: "team-storefront",
        teamName: "Storefront",
      },
    });
    mockSetVisibility.mockResolvedValue({
      data: { projectName: "checkout-ui", isShared: true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The point of the section: a MEMBER sees both axes without a second read.
  // The team list is an ADMIN route, so asking for it would answer 403 and paint
  // an error into a panel that has nothing to fix.
  it("shows both axes to a member without reading the admin team list", async () => {
    const wrapper = mountSection({});

    expect(
      wrapper.get(`[data-testid="${TEST_ID.projectAffiliationGroup}"]`).text(),
    ).toBe("Customer-facing");
    expect(
      wrapper.get(`[data-testid="${TEST_ID.projectTeamCurrent}"]`).text(),
    ).toBe("Storefront");

    expect(mockList).not.toHaveBeenCalled();
    expect(
      wrapper.find(`[data-testid="${TEST_ID.projectTeamSelect}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.projectTeamSave}"]`).exists(),
    ).toBe(false);
    // Publishing is an ADMIN write, so the member does not get the control.
    expect(
      wrapper
        .find(`[data-testid="${TEST_ID.projectVisibilityToggle}"]`)
        .exists(),
    ).toBe(false);
  });

  it("gives an admin the assignment control and the visibility toggle", async () => {
    const wrapper = mountSection({ canManageTeam: true });

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.projectTeamSelect}"]`).exists(),
      ).toBe(true),
    );
    expect(mockList).toHaveBeenCalled();
    // The current owner is read from the list the control writes to, so a save
    // cannot leave the label describing the previous team.
    expect(
      wrapper.get(`[data-testid="${TEST_ID.projectTeamCurrent}"]`).text(),
    ).toBe("Storefront");
    expect(
      wrapper
        .find(`[data-testid="${TEST_ID.projectVisibilityToggle}"]`)
        .exists(),
    ).toBe(true);
    expect(
      wrapper.get(`[data-testid="${TEST_ID.projectVisibilityState}"]`).text(),
    ).toBe("Currently visible to its team only.");
  });

  // One click, one audited write: the flag widens who may read the project, so
  // it must not wait for a "save" the admin could forget.
  it("publishes the project on toggle", async () => {
    const wrapper = mountSection({ canManageTeam: true });

    const toggle = await vi.waitFor(() => {
      const input = wrapper.find(
        `[data-testid="${TEST_ID.projectVisibilityToggle}"]`,
      );
      expect(input.exists()).toBe(true);
      return input;
    });
    await toggle.setValue(true);

    expect(mockSetVisibility).toHaveBeenCalledWith({
      path: { projectName: "checkout-ui" },
      body: { isShared: true },
    });
    expect(
      wrapper.get(`[data-testid="${TEST_ID.projectVisibilityState}"]`).text(),
    ).toBe("Currently visible to every signed-in person.");
  });

  it("falls back to the server state when the toggle write fails", async () => {
    mockSetVisibility.mockResolvedValue({ error: { message: "Forbidden" } });
    const wrapper = mountSection({ canManageTeam: true });

    const toggle = await vi.waitFor(() => {
      const input = wrapper.find(
        `[data-testid="${TEST_ID.projectVisibilityToggle}"]`,
      );
      expect(input.exists()).toBe(true);
      return input;
    });
    await toggle.setValue(true);

    await vi.waitFor(() =>
      expect(
        wrapper.get(`[data-testid="${TEST_ID.projectVisibilityState}"]`).text(),
      ).toBe("Currently visible to its team only."),
    );
    expect(
      wrapper
        .find(`[data-testid="${TEST_ID.projectVisibilityError}"]`)
        .exists(),
    ).toBe(true);
  });
});
