import { describe, expect, it, vi, beforeEach } from "vitest";

const update = vi.fn();
const remove = vi.fn();
const updateProject = vi.fn();

vi.mock("@sdk", () => ({
  branchesControllerUpdate: (...args: unknown[]) => update(...args),
  branchesControllerRemove: (...args: unknown[]) => remove(...args),
  projectsControllerUpdateProject: (...args: unknown[]) =>
    updateProject(...args),
}));

describe("branch mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({ data: { isArchived: true } });
    remove.mockResolvedValue({ data: { removed: true } });
    updateProject.mockResolvedValue({ data: { name: "app" } });
  });

  it("archives a branch", async () => {
    const { archiveBranch } = await import("../composables/useBranchMutations");

    await archiveBranch("app", "feature/x", true);

    expect(update).toHaveBeenCalledWith({
      path: { projectName: "app" },
      query: { branch: "feature/x" },
      body: { isArchived: true },
    });
  });

  it("unarchives a branch", async () => {
    const { archiveBranch } = await import("../composables/useBranchMutations");

    await archiveBranch("app", "feature/x", false);

    expect(update).toHaveBeenCalledWith({
      path: { projectName: "app" },
      query: { branch: "feature/x" },
      body: { isArchived: false },
    });
  });

  it("deletes a branch", async () => {
    const { deleteBranch } = await import("../composables/useBranchMutations");

    await deleteBranch("app", "feature/x");

    expect(remove).toHaveBeenCalledWith({
      path: { projectName: "app" },
      query: { branch: "feature/x" },
    });
  });

  // "Set default" is a project PATCH, not a branch PATCH — the two endpoints
  // differ, and the UI must hit the right one.
  it("promotes a branch to the project default", async () => {
    const { setDefaultBranch } =
      await import("../composables/useBranchMutations");

    await setDefaultBranch("app", "release/1.2");

    expect(updateProject).toHaveBeenCalledWith({
      path: { projectName: "app" },
      body: { defaultBranchName: "release/1.2" },
    });
  });

  it("retargets a branch, including back to the project default", async () => {
    const { retargetBranch } =
      await import("../composables/useBranchMutations");

    await retargetBranch("app", "feature/x", "release/1.2");
    await retargetBranch("app", "feature/x", null);

    expect(update).toHaveBeenNthCalledWith(1, {
      path: { projectName: "app" },
      query: { branch: "feature/x" },
      body: { targetBranch: "release/1.2" },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      path: { projectName: "app" },
      query: { branch: "feature/x" },
      body: { targetBranch: null },
    });
  });
});
