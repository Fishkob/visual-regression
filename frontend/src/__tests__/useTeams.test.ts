import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  useAssignProjectTeam,
  useCreateTeam,
  useDeleteTeam,
  useRenameTeam,
  useReplaceTeamMembers,
  useTeamsQuery,
} from "@/composables/useTeams";

const mockList = vi.hoisted(() => vi.fn());
const mockAssign = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockRename = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
const mockReplaceMembers = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  teamsControllerList: (...args: unknown[]) => mockList(...args),
  projectTeamControllerAssign: (...args: unknown[]) => mockAssign(...args),
  teamsControllerCreate: (...args: unknown[]) => mockCreate(...args),
  teamsControllerRename: (...args: unknown[]) => mockRename(...args),
  teamsControllerRemove: (...args: unknown[]) => mockRemove(...args),
  teamsControllerReplaceMembers: (...args: unknown[]) =>
    mockReplaceMembers(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mounted: VueWrapper[] = [];

function mountComposable<T>(useComposable: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  let result!: T;

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useComposable();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  mounted.push(wrapper);

  return { result, invalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe("useTeamsQuery", () => {
  it("unwraps the SDK list into mapped teams", async () => {
    mockList.mockResolvedValue({
      data: [
        {
          id: "t-1",
          name: "Checkout",
          createdBy: "admin",
          createdAt: "2026-10-20T10:00:00.000Z",
          members: [{ userId: "u-1", username: "alice", role: "MEMBER" }],
          projects: [{ id: "p-1", name: "checkout-ui" }],
        },
      ],
    });

    const { result } = mountComposable(() => useTeamsQuery());

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(mockList).toHaveBeenCalledOnce();
    expect(result.data.value?.[0]).toEqual({
      id: "t-1",
      name: "Checkout",
      createdBy: "admin",
      createdAt: "2026-10-20T10:00:00.000Z",
      members: [{ userId: "u-1", username: "alice", role: "MEMBER" }],
      projects: [{ id: "p-1", name: "checkout-ui" }],
    });
  });

  it("maps a response without a data member to an empty list", async () => {
    mockList.mockResolvedValue({});

    const { result } = mountComposable(() => useTeamsQuery());

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(result.data.value).toEqual([]);
  });
});

describe("useAssignProjectTeam", () => {
  it("assigns the team, toasts and invalidates the teams key", async () => {
    mockAssign.mockResolvedValue({
      data: {
        projectId: "p-1",
        projectName: "checkout-ui",
        teamId: "t-1",
        teamName: "Checkout",
      },
    });

    const { result, invalidate } = mountComposable(useAssignProjectTeam);

    await result.mutateAsync({ projectName: "checkout-ui", teamId: "t-1" });

    expect(mockAssign).toHaveBeenCalledWith({
      path: { projectName: "checkout-ui" },
      body: { teamId: "t-1" },
    });
    expect(toast.success).toHaveBeenCalledWith("Project assigned to the team");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["teams"] });
  });

  it("reports the shared state in its own words", async () => {
    mockAssign.mockResolvedValue({
      data: {
        projectId: "p-1",
        projectName: "checkout-ui",
        teamId: null,
        teamName: null,
      },
    });

    const { result } = mountComposable(useAssignProjectTeam);

    await result.mutateAsync({ projectName: "checkout-ui", teamId: null });

    // `null` is a real write (it makes the project shared), so it must not read
    // like a failed save or like an assignment to some team.
    expect(mockAssign).toHaveBeenCalledWith({
      path: { projectName: "checkout-ui" },
      body: { teamId: null },
    });
    expect(toast.success).toHaveBeenCalledWith("Project is now shared");
  });

  it("surfaces the SDK error and does not invalidate", async () => {
    mockAssign.mockResolvedValue({
      error: { message: "Team not found" },
    });

    const { result, invalidate } = mountComposable(useAssignProjectTeam);

    await expect(
      result.mutateAsync({ projectName: "checkout-ui", teamId: "ghost" }),
    ).rejects.toThrow("Team not found");

    expect(toast.error).toHaveBeenCalledWith("Assignment failed");
    expect(invalidate).not.toHaveBeenCalled();
  });
});

const teamDto = {
  id: "t-1",
  name: "Checkout",
  createdBy: "admin",
  createdAt: "2026-10-20T10:00:00.000Z",
  members: [],
  projects: [],
};

// Every team write is a mutation on the same list, so the four tests pin the
// same three things: the SDK call's argument shape, the toast, and the team-key
// invalidation. The dialog tests lean on that wiring.
describe("team administration mutations", () => {
  it("creates a team", async () => {
    mockCreate.mockResolvedValue({ data: teamDto });

    const { result, invalidate } = mountComposable(useCreateTeam);

    await result.mutateAsync({ name: "Checkout" });

    expect(mockCreate).toHaveBeenCalledWith({ body: { name: "Checkout" } });
    expect(toast.success).toHaveBeenCalledWith("Team created");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["teams"] });
  });

  it("renames a team", async () => {
    mockRename.mockResolvedValue({ data: teamDto });

    const { result, invalidate } = mountComposable(useRenameTeam);

    await result.mutateAsync({ id: "t-1", name: "Storefront" });

    expect(mockRename).toHaveBeenCalledWith({
      path: { id: "t-1" },
      body: { name: "Storefront" },
    });
    expect(toast.success).toHaveBeenCalledWith("Team renamed");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["teams"] });
  });

  it("deletes a team", async () => {
    mockRemove.mockResolvedValue({ data: { success: true } });

    const { result, invalidate } = mountComposable(useDeleteTeam);

    await result.mutateAsync("t-1");

    expect(mockRemove).toHaveBeenCalledWith({ path: { id: "t-1" } });
    expect(toast.success).toHaveBeenCalledWith("Team deleted");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["teams"] });
  });

  it("replaces the complete member set", async () => {
    mockReplaceMembers.mockResolvedValue({ data: teamDto });

    const { result, invalidate } = mountComposable(useReplaceTeamMembers);

    await result.mutateAsync({ id: "t-1", userIds: ["u-1", "u-2"] });

    expect(mockReplaceMembers).toHaveBeenCalledWith({
      path: { id: "t-1" },
      body: { userIds: ["u-1", "u-2"] },
    });
    expect(toast.success).toHaveBeenCalledWith("Members saved");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["teams"] });
  });
});
