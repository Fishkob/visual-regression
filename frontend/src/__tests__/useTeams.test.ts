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
  useSetProjectVisibility,
  useTeamsQuery,
} from "@/composables/useTeams";

const mockList = vi.hoisted(() => vi.fn());
const mockAssign = vi.hoisted(() => vi.fn());
const mockSetVisibility = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockRename = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
const mockReplaceMembers = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  teamsControllerList: (...args: unknown[]) => mockList(...args),
  projectTeamControllerAssign: (...args: unknown[]) => mockAssign(...args),
  projectVisibilityControllerUpdate: (...args: unknown[]) =>
    mockSetVisibility(...args),
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
    expect(toast.success).toHaveBeenCalledWith("Project moved");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["teams"] });
  });

  it("surfaces the SDK error and does not invalidate", async () => {
    mockAssign.mockResolvedValue({
      error: { message: "Team not found" },
    });

    const { result, invalidate } = mountComposable(useAssignProjectTeam);

    await expect(
      result.mutateAsync({ projectName: "checkout-ui", teamId: "ghost" }),
    ).rejects.toThrow("Team not found");

    expect(toast.error).toHaveBeenCalledWith("Could not move the project");
    expect(invalidate).not.toHaveBeenCalled();
  });
});

// Publishing is a separate write from moving (ADR-083): it widens who may read
// the project without changing its owner, so it has its own route, its own
// words, and its own refresh.
describe("useSetProjectVisibility", () => {
  it("publishes the project, toasts and refreshes the project reads", async () => {
    mockSetVisibility.mockResolvedValue({
      data: { projectName: "checkout-ui", isShared: true },
    });

    const { result, invalidate } = mountComposable(useSetProjectVisibility);

    await result.mutateAsync({ projectName: "checkout-ui", isShared: true });

    expect(mockSetVisibility).toHaveBeenCalledWith({
      path: { projectName: "checkout-ui" },
      body: { isShared: true },
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Project is now visible to everyone",
    );
    // Both lists carry the flag, so both keys are refreshed.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["teams"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });

  it("says so when the project is narrowed again", async () => {
    mockSetVisibility.mockResolvedValue({
      data: { projectName: "checkout-ui", isShared: false },
    });

    const { result } = mountComposable(useSetProjectVisibility);

    await result.mutateAsync({ projectName: "checkout-ui", isShared: false });

    expect(toast.success).toHaveBeenCalledWith(
      "Project is visible to its team again",
    );
  });

  it("surfaces the SDK error and does not invalidate", async () => {
    mockSetVisibility.mockResolvedValue({
      error: { message: "Forbidden" },
    });

    const { result, invalidate } = mountComposable(useSetProjectVisibility);

    await expect(
      result.mutateAsync({ projectName: "checkout-ui", isShared: true }),
    ).rejects.toThrow("Forbidden");

    expect(toast.error).toHaveBeenCalledWith("Could not change the visibility");
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
