import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { useProjectGroupAssignment } from "@/composables/useProjectGroupAssignment";

const mockUpdateProject = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  projectsControllerUpdateProject: (...args: unknown[]) =>
    mockUpdateProject(...args),
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

describe("useProjectGroupAssignment", () => {
  it("moves the project with the update endpoint and invalidates both lists", async () => {
    mockUpdateProject.mockResolvedValue({
      data: { name: "checkout", groupId: "g1" },
    });

    const { result, invalidate } = mountComposable(useProjectGroupAssignment);

    await result.mutateAsync({ projectName: "checkout", groupId: "g1" });

    expect(mockUpdateProject).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      body: { groupId: "g1" },
    });
    expect(toast.success).toHaveBeenCalledWith("Project moved");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["groups"] });
  });

  it("unassigns a project by sending a null group id", async () => {
    mockUpdateProject.mockResolvedValue({
      data: { name: "checkout", groupId: null },
    });

    const { result } = mountComposable(useProjectGroupAssignment);

    await result.mutateAsync({ projectName: "checkout", groupId: null });

    expect(mockUpdateProject).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      body: { groupId: null },
    });
  });

  it("surfaces the SDK message on failure without invalidating", async () => {
    mockUpdateProject.mockResolvedValue({
      error: { message: "Project not found" },
    });

    const { result, invalidate } = mountComposable(useProjectGroupAssignment);

    await expect(
      result.mutateAsync({ projectName: "missing", groupId: "g1" }),
    ).rejects.toThrow("Project not found");

    expect(toast.error).toHaveBeenCalledWith("Could not move project");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
