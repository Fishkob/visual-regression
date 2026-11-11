import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { useRenameProject } from "@/composables/useProjectRename";

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

describe("useRenameProject", () => {
  it("renames the project through the update endpoint and answers with the row", async () => {
    mockUpdateProject.mockResolvedValue({
      data: { id: "p1", name: "storefront" },
    });

    const { result, invalidate } = mountComposable(() =>
      useRenameProject("checkout"),
    );

    const project = await result.mutateAsync("storefront");

    expect(mockUpdateProject).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      body: { name: "storefront" },
    });
    expect(project).toMatchObject({ name: "storefront" });
    expect(toast.success).toHaveBeenCalledWith("Project renamed");
    // The name is part of nearly every project-scoped key, so the rename
    // refreshes the families instead of one entry.
    for (const key of [
      ["projects"],
      ["pending-tests"],
      ["review-inbox"],
      ["assignments"],
      ["search"],
      ["branches"],
      ["runs"],
      ["storage"],
      ["webhooks"],
      ["test-metadata"],
      ["approvals"],
      ["baseline-history"],
      ["visual-tests"],
      ["pdf-tests"],
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
  });

  it("surfaces the SDK message on failure without invalidating", async () => {
    mockUpdateProject.mockResolvedValue({
      error: {
        message: "Project name must be alphanumeric, dash or underscore",
      },
    });

    const { result, invalidate } = mountComposable(() =>
      useRenameProject("checkout"),
    );

    await expect(result.mutateAsync("check out")).rejects.toThrow(
      "Project name must be alphanumeric, dash or underscore",
    );

    expect(toast.error).toHaveBeenCalledWith("Could not rename the project");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
