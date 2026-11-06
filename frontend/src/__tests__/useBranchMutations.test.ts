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

  // The post-merge cleanup: the archive must land first, otherwise a refused
  // delete leaves nothing behind and the branch keeps accepting uploads.
  it("archives a branch before deleting it", async () => {
    const order: string[] = [];
    update.mockImplementation(async () => {
      order.push("archive");
      return { data: { isArchived: true } };
    });
    remove.mockImplementation(async () => {
      order.push("delete");
      return { data: { success: true } };
    });
    const { archiveAndDeleteBranch } =
      await import("../composables/useBranchMutations");

    await archiveAndDeleteBranch("app", "feature/x");

    expect(order).toEqual(["archive", "delete"]);
    expect(update).toHaveBeenCalledWith({
      path: { projectName: "app" },
      query: { branch: "feature/x" },
      body: { isArchived: true },
    });
  });

  // A partial failure is reported as such: the branch really is archived, and a
  // message that only said "delete failed" would hide the state the next click
  // starts from.
  it("reports the archive half of a failed archive-and-delete", async () => {
    remove.mockRejectedValue(new Error("2 branches inherit from this one"));
    const { archiveAndDeleteBranch } =
      await import("../composables/useBranchMutations");

    await expect(archiveAndDeleteBranch("app", "feature/x")).rejects.toThrow(
      /archived.*2 branches inherit from this one/,
    );
  });
});
