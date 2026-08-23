import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useProjectDelete } from "@/composables/useProjectDelete";

const mockDeleteProject = vi.hoisted(() => vi.fn());
const mockInvalidateProjectList = vi.hoisted(() => vi.fn());
const mockInvalidateProjectDetail = vi.hoisted(() => vi.fn());

const { mockUseEntityDeleteMutation, deleteConfig, mockState } = vi.hoisted(
  () => {
    interface DeleteConfig {
      mutationFn: (args: string) => Promise<unknown>;
      argsOf: (entity: { name?: string }) => string | null;
      successMessage: (args: string) => string;
      errorMessage: string;
      invalidate: (client: unknown, args: string) => void;
    }

    const deleteConfig: { current?: DeleteConfig } = {};
    // ref() is unavailable at hoist time, so the mock factory (which runs lazily
    // at import) owns the pendingEntity ref and exposes it here for tests.
    const mockState: {
      pendingEntity: null | { value: { name?: string } | null };
    } = { pendingEntity: null };

    const mockUseEntityDeleteMutation = vi.fn((opts: DeleteConfig) => {
      deleteConfig.current = opts;
      mockState.pendingEntity = ref<{ name?: string } | null>(null);
      return {
        pendingEntity: mockState.pendingEntity,
        showConfirm: ref(false),
        deleting: ref(false),
        requestDelete: vi.fn(),
        confirmDelete: vi.fn(),
        cancelDelete: vi.fn(),
      };
    });

    return { mockUseEntityDeleteMutation, deleteConfig, mockState };
  },
);

vi.mock("@sdk", () => ({
  projectsControllerDeleteProject: mockDeleteProject,
}));

vi.mock("@/lib/invalidation", () => ({
  invalidateProjectList: mockInvalidateProjectList,
  invalidateProjectDetail: mockInvalidateProjectDetail,
}));

vi.mock("@/composables/useEntityDeleteMutation", () => ({
  useEntityDeleteMutation: mockUseEntityDeleteMutation,
}));

describe("useProjectDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteConfig.current = undefined;
    if (mockState.pendingEntity) mockState.pendingEntity.value = null;
  });

  it("deletes through the SDK call scoped to the project name", async () => {
    useProjectDelete();

    await deleteConfig.current!.mutationFn("checkout-ui");

    expect(mockDeleteProject).toHaveBeenCalledWith({
      path: { projectName: "checkout-ui" },
    });
  });

  it("builds the deletion args from the project name, rejecting a nameless project", () => {
    useProjectDelete();

    expect(deleteConfig.current!.argsOf({ name: "checkout-ui" })).toBe(
      "checkout-ui",
    );
    expect(deleteConfig.current!.argsOf({ name: undefined })).toBeNull();
  });

  it("reports the deleted project in the success message", () => {
    useProjectDelete();

    expect(deleteConfig.current!.successMessage("checkout-ui")).toContain(
      "checkout-ui",
    );
    expect(deleteConfig.current!.errorMessage).toBe("Could not delete project");
  });

  it("invalidates the project list and the deleted project detail", () => {
    const client = { invalidateQueries: vi.fn() };

    useProjectDelete();

    deleteConfig.current!.invalidate(client as never, "checkout-ui");

    expect(mockInvalidateProjectList).toHaveBeenCalledWith(client);
    expect(mockInvalidateProjectDetail).toHaveBeenCalledWith(
      client,
      "checkout-ui",
    );
  });

  it("describes the pending project in the confirm dialog", () => {
    const { deleteDescription } = useProjectDelete();

    expect(deleteDescription.value).toBe("");

    mockState.pendingEntity!.value = { name: "checkout-ui" };

    expect(deleteDescription.value).toContain("checkout-ui");
    expect(deleteDescription.value).toContain("cannot be undone");
  });
});
