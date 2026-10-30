import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  useApiKeysQuery,
  useCreateApiKey,
  useDeleteApiKey,
} from "@/composables/useApiKeys";

const mockFindAll = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  apiKeysControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  apiKeysControllerCreate: (...args: unknown[]) => mockCreate(...args),
  apiKeysControllerRemove: (...args: unknown[]) => mockRemove(...args),
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

describe("useApiKeysQuery", () => {
  it("unwraps the SDK list into mapped api keys", async () => {
    mockFindAll.mockResolvedValue({
      data: [
        {
          id: 7,
          name: "ci",
          keyHint: "vrk_abc",
          createdAt: "2024-01-01T00:00:00.000Z",
          status: "active",
        },
        { id: 8, name: "deploy" },
      ],
    });

    const { result } = mountComposable(useApiKeysQuery);

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(mockFindAll).toHaveBeenCalledOnce();
    expect(result.data.value?.[0]).toMatchObject({
      id: "7",
      name: "ci",
      keyHint: "vrk_abc",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "active",
    });
    expect(result.data.value?.[1]).toMatchObject({
      id: "8",
      name: "deploy",
      keyHint: null,
      createdBy: null,
      revokedReason: null,
      status: "active",
    });
  });

  it("maps a response without a data member to an empty list", async () => {
    mockFindAll.mockResolvedValue({});

    const { result } = mountComposable(useApiKeysQuery);

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(result.data.value).toEqual([]);
  });
});

describe("useCreateApiKey", () => {
  it("posts the payload and hands back the one-time raw key", async () => {
    const issued = {
      id: 12,
      name: "ci",
      rawKey: "vrk_secret",
      keyHint: "vrk_sec",
      expiresAt: null,
    };
    mockCreate.mockResolvedValue({ data: issued });

    const { result } = mountComposable(useCreateApiKey);

    const data = await result.mutateAsync({ name: "ci", expiresInDays: 30 });

    expect(mockCreate).toHaveBeenCalledWith({
      body: { name: "ci", expiresInDays: 30 },
    });
    expect(data).toEqual(issued);
  });

  it("toasts success and invalidates the api-keys queries", async () => {
    mockCreate.mockResolvedValue({ data: { id: 1, name: "ci" } });

    const { result, invalidate } = mountComposable(useCreateApiKey);

    await result.mutateAsync({ name: "ci" });

    expect(toast.success).toHaveBeenCalledWith("API key created");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["api-keys"] });
  });

  it("surfaces the SDK error and does not invalidate", async () => {
    mockCreate.mockResolvedValue({
      error: { message: "API key name already exists" },
    });

    const { result, invalidate } = mountComposable(useCreateApiKey);

    await expect(result.mutateAsync({ name: "ci" })).rejects.toThrow(
      "API key name already exists",
    );

    expect(toast.error).toHaveBeenCalledWith("Could not create API key");
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useDeleteApiKey", () => {
  it("deletes by id and invalidates the api-keys queries", async () => {
    mockRemove.mockResolvedValue({ data: { removed: true } });

    const { result, invalidate } = mountComposable(useDeleteApiKey);

    await result.mutateAsync("7");

    expect(mockRemove).toHaveBeenCalledWith({ path: { id: "7" } });
    expect(toast.success).toHaveBeenCalledWith("API key deleted");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["api-keys"] });
  });

  it("toasts the configured error when the delete fails", async () => {
    mockRemove.mockRejectedValue(new Error("network down"));

    const { result } = mountComposable(useDeleteApiKey);

    await expect(result.mutateAsync("7")).rejects.toThrow("network down");

    expect(toast.error).toHaveBeenCalledWith("Could not delete API key");
  });
});
