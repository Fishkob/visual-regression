import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { useCreateProject } from "@/composables/useProjectCreate";

const mockCreateProject = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  projectsControllerCreate: (...args: unknown[]) => mockCreateProject(...args),
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

describe("useCreateProject", () => {
  it("creates the project with its group and invalidates the project lists", async () => {
    mockCreateProject.mockResolvedValue({
      data: { id: "p1", name: "checkout", groupId: "g1" },
    });

    const { result, invalidate } = mountComposable(useCreateProject);

    const project = await result.mutateAsync({
      name: "checkout",
      groupId: "g1",
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      body: { name: "checkout", groupId: "g1" },
    });
    expect(project).toMatchObject({ id: "p1", name: "checkout" });
    expect(toast.success).toHaveBeenCalledWith("Project created");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["groups"] });
  });

  it("creates an unassigned project when no group is given", async () => {
    mockCreateProject.mockResolvedValue({ data: { name: "checkout" } });

    const { result } = mountComposable(useCreateProject);

    await result.mutateAsync({ name: "checkout" });

    expect(mockCreateProject).toHaveBeenCalledWith({
      body: { name: "checkout" },
    });
  });

  it("surfaces the SDK message on failure without invalidating", async () => {
    mockCreateProject.mockResolvedValue({
      error: { message: "Project name already taken" },
    });

    const { result, invalidate } = mountComposable(useCreateProject);

    await expect(result.mutateAsync({ name: "checkout" })).rejects.toThrow(
      "Project name already taken",
    );

    expect(toast.error).toHaveBeenCalledWith("Could not create project");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
