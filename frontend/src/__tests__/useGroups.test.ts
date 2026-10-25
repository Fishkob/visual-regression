import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  useCreateGroup,
  useDeleteGroup,
  useGroupsQuery,
  useRenameGroup,
} from "@/composables/useGroups";

const mockFindAll = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockRename = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  projectGroupsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  projectGroupsControllerCreate: (...args: unknown[]) => mockCreate(...args),
  projectGroupsControllerRename: (...args: unknown[]) => mockRename(...args),
  projectGroupsControllerRemove: (...args: unknown[]) => mockRemove(...args),
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

describe("useGroupsQuery", () => {
  it("unwraps the SDK list into mapped groups", async () => {
    mockFindAll.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "Platform",
          createdAt: "2024-01-01T00:00:00.000Z",
          projectCount: 3,
        },
        { id: "g2", name: "Unassigned" },
      ],
    });

    const { result } = mountComposable(useGroupsQuery);

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(mockFindAll).toHaveBeenCalledOnce();
    expect(result.data.value?.[0]).toEqual({
      id: "g1",
      name: "Platform",
      createdAt: "2024-01-01T00:00:00.000Z",
      projectCount: 3,
    });
    expect(result.data.value?.[1]).toEqual({
      id: "g2",
      name: "Unassigned",
      projectCount: 0,
    });
  });

  it("maps a response without a data member to an empty list", async () => {
    mockFindAll.mockResolvedValue({});

    const { result } = mountComposable(useGroupsQuery);

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(result.data.value).toEqual([]);
  });
});

describe("useCreateGroup", () => {
  it("creates the group, toasts and invalidates the groups key", async () => {
    mockCreate.mockResolvedValue({ data: { id: "g3", name: "Platform" } });

    const { result, invalidate } = mountComposable(useCreateGroup);

    await result.mutateAsync({ name: "Platform" });

    expect(mockCreate).toHaveBeenCalledWith({ body: { name: "Platform" } });
    expect(toast.success).toHaveBeenCalledWith("Group created");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["groups"] });
  });

  it("surfaces the SDK error and does not invalidate", async () => {
    mockCreate.mockResolvedValue({
      error: { message: "Group name already exists" },
    });

    const { result, invalidate } = mountComposable(useCreateGroup);

    await expect(result.mutateAsync({ name: "Platform" })).rejects.toThrow(
      "Group name already exists",
    );

    expect(toast.error).toHaveBeenCalledWith("Could not create group");
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useRenameGroup", () => {
  it("renames by id and invalidates the groups and projects lists", async () => {
    mockRename.mockResolvedValue({ data: { id: "g1", name: "Renamed" } });

    const { result, invalidate } = mountComposable(useRenameGroup);

    await result.mutateAsync({ id: "g1", name: "Renamed" });

    expect(mockRename).toHaveBeenCalledWith({
      path: { id: "g1" },
      body: { name: "Renamed" },
    });
    expect(toast.success).toHaveBeenCalledWith("Group renamed");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["groups"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });
});

describe("useDeleteGroup", () => {
  it("deletes by id and invalidates the groups and projects lists", async () => {
    mockRemove.mockResolvedValue({ data: { removed: true } });

    const { result, invalidate } = mountComposable(useDeleteGroup);

    await result.mutateAsync("g1");

    expect(mockRemove).toHaveBeenCalledWith({ path: { id: "g1" } });
    expect(toast.success).toHaveBeenCalledWith("Group deleted");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["groups"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });

  it("toasts the configured error when the delete fails", async () => {
    mockRemove.mockRejectedValue(new Error("network down"));

    const { result } = mountComposable(useDeleteGroup);

    await expect(result.mutateAsync("g1")).rejects.toThrow("network down");

    expect(toast.error).toHaveBeenCalledWith("Could not delete group");
  });
});
