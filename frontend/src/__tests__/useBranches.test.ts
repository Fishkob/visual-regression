import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

const mockUseQuery = vi.fn();
const mockListBranches = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("@sdk", () => ({
  branchesControllerList: mockListBranches,
}));

const branchDto = (overrides: Record<string, unknown> = {}) => ({
  name: "main",
  isDefault: true,
  isArchived: false,
  targetBranchName: null,
  testCount: 4,
  pendingCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("useBranchesQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: ref(null),
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });
  });

  it("keys the list by project and archived inclusion", async () => {
    const { useBranchesQuery } = await import("@/composables/useBranches");

    useBranchesQuery(ref("app"));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey.value).toEqual(["branches", "app", false]);
  });

  it("gates the query until the project name is ready", async () => {
    const { useBranchesQuery } = await import("@/composables/useBranches");

    const projectName = ref<string>("");
    useBranchesQuery(projectName);

    expect(mockUseQuery.mock.calls[0][0].queryKey.value).toEqual([]);
    expect(mockUseQuery.mock.calls[0][0].enabled.value).toBe(false);

    projectName.value = "app";

    expect(mockUseQuery.mock.calls[0][0].queryKey.value).toEqual([
      "branches",
      "app",
      false,
    ]);
  });

  it("fetches and maps the branch list", async () => {
    const { useBranchesQuery } = await import("@/composables/useBranches");
    mockListBranches.mockResolvedValue({
      data: [branchDto(), branchDto({ name: "feature/x", isDefault: false })],
    });

    useBranchesQuery(ref("app"));

    const options = mockUseQuery.mock.calls[0][0];
    const result = await options.queryFn();

    expect(mockListBranches).toHaveBeenCalledWith({
      path: { projectName: "app" },
      query: { includeArchived: false },
    });
    expect(result.map((branch: { name: string }) => branch.name)).toEqual([
      "main",
      "feature/x",
    ]);
  });

  it("asks for archived branches when requested", async () => {
    const { useBranchesQuery } = await import("@/composables/useBranches");
    mockListBranches.mockResolvedValue({ data: [] });

    useBranchesQuery(ref("app"), true);

    const options = mockUseQuery.mock.calls[0][0];
    await options.queryFn();

    expect(options.queryKey.value).toEqual(["branches", "app", true]);
    expect(mockListBranches).toHaveBeenCalledWith({
      path: { projectName: "app" },
      query: { includeArchived: true },
    });
  });
});
