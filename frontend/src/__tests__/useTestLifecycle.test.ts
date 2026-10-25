import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  useTestMetadata,
  useUpdateTestMetadata,
} from "@/composables/useTestLifecycle";
import { testMetadataQueryKeys } from "@/domains/test-lifecycle/query-keys";

const { mockGet, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@sdk", () => ({
  testLifecycleControllerGet: (...args: unknown[]) => mockGet(...args),
  testLifecycleControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const metadataDto = (overrides: Record<string, unknown> = {}) => ({
  id: "t-1",
  name: "checkout",
  description: "desc",
  tags: ["smoke"],
  mutedUntil: null,
  muteReason: null,
  isMuted: false,
  flake: { transitions: 1, changed: 1, clean: 0 },
  ...overrides,
});

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

describe("useTestMetadata", () => {
  it("reads the metadata of the test on the selected branch", async () => {
    mockGet.mockResolvedValue({ data: metadataDto() });

    const { result } = mountComposable(() =>
      useTestMetadata("checkout", "login", "feature/x"),
    );

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(mockGet).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "feature/x" },
    });
    expect(result.data.value?.tags).toEqual(["smoke"]);
    expect(result.data.value?.flake.transitions).toBe(1);
  });

  it("omits the branch query when the default branch is used", async () => {
    mockGet.mockResolvedValue({ data: metadataDto() });

    const { result } = mountComposable(() =>
      useTestMetadata("checkout", "login", undefined),
    );

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(mockGet).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
    });
  });
});

describe("useUpdateTestMetadata", () => {
  it("sends only the changed fields and refreshes the reads", async () => {
    const mutedUntil = "2026-11-01T10:00:00.000Z";
    mockUpdate.mockResolvedValue({
      data: metadataDto({
        name: "renamed",
        tags: ["smoke", "ci"],
        mutedUntil,
        muteReason: "flaky",
        isMuted: true,
      }),
    });

    const { result, invalidate } = mountComposable(() =>
      useUpdateTestMetadata("checkout", "login", "feature/x"),
    );

    const saved = await result.mutateAsync({
      name: "renamed",
      tags: ["smoke", "ci"],
      mutedUntil,
      muteReason: "flaky",
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "feature/x" },
      body: {
        name: "renamed",
        tags: ["smoke", "ci"],
        mutedUntil,
        muteReason: "flaky",
      },
    });
    expect(saved.name).toBe("renamed");
    expect(saved.tags).toEqual(["smoke", "ci"]);
    expect(mockUpdate.mock.calls[0]?.[0]).not.toHaveProperty(
      "body.description",
    );
    expect(toast.success).toHaveBeenCalledWith("Test updated");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: testMetadataQueryKeys.all(),
    });
  });

  it("clears the mute with a null mutedUntil", async () => {
    mockUpdate.mockResolvedValue({ data: metadataDto() });

    const { result } = mountComposable(() =>
      useUpdateTestMetadata("checkout", "login", undefined),
    );

    await result.mutateAsync({ mutedUntil: null, muteReason: null });

    expect(mockUpdate).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      body: { mutedUntil: null, muteReason: null },
    });
  });

  it("rejects with the server message and does not invalidate on failure", async () => {
    mockUpdate.mockResolvedValue({
      error: { message: "A test with this name already exists on the branch" },
    });

    const { result, invalidate } = mountComposable(() =>
      useUpdateTestMetadata("checkout", "login", undefined),
    );

    await expect(result.mutateAsync({ name: "taken" })).rejects.toThrow(
      "A test with this name already exists on the branch",
    );
    expect(toast.error).toHaveBeenCalledWith("Could not update the test");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
