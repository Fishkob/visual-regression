import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

const mockUseQuery = vi.fn();
const mockGetKind = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("@sdk", () => ({
  testsQueriesControllerGetKind: mockGetKind,
}));

describe("useTestKind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: ref({ kind: "image" }),
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });
  });

  it("builds the test-kind query key from project and test names", async () => {
    const { useTestKind } = await import("@/composables/useTestKind");

    useTestKind(ref("my-project"), ref("my-test"));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey.value).toEqual([
      "test-kind",
      "kind",
      "my-project",
      "my-test",
    ]);
  });

  it("collapses the key when projectName or testName is empty (the gating convention)", async () => {
    const { useTestKind } = await import("@/composables/useTestKind");

    useTestKind(ref(""), ref("my-test"));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey.value).toEqual([]);
    expect(options.enabled.value).toBe(false);
  });

  it("queries with retry 2 for the kind fetch", async () => {
    const { useTestKind } = await import("@/composables/useTestKind");

    useTestKind(ref("proj"), ref("test"));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.retry).toBe(2);
  });

  it("fetches kind through the SDK with the project and test path", async () => {
    const { useTestKind } = await import("@/composables/useTestKind");
    mockGetKind.mockResolvedValue({ data: { kind: "pdf" } });

    useTestKind(ref("proj"), ref("test"));

    const options = mockUseQuery.mock.calls[0][0];
    const result = await options.queryFn();

    expect(mockGetKind).toHaveBeenCalledWith({
      path: { projectName: "proj", testName: "test" },
    });
    expect(result).toEqual({ kind: "pdf" });
  });

  it("narrows a non-domain kind string to null", async () => {
    const { useTestKind } = await import("@/composables/useTestKind");
    mockGetKind.mockResolvedValue({ data: { kind: "weird-value" } });

    useTestKind(ref("proj"), ref("test"));

    const options = mockUseQuery.mock.calls[0][0];
    const result = await options.queryFn();

    expect(result).toEqual({ kind: null });
  });

  it("maps a missing kind to null", async () => {
    const { useTestKind } = await import("@/composables/useTestKind");
    mockGetKind.mockResolvedValue({ data: {} });

    useTestKind(ref("proj"), ref("test"));

    const options = mockUseQuery.mock.calls[0][0];
    const result = await options.queryFn();

    expect(result).toEqual({ kind: null });
  });

  it("exposes the narrowed kind as a computed", async () => {
    const { useTestKind } = await import("@/composables/useTestKind");

    const { kind } = useTestKind(ref("proj"), ref("test"));

    expect(kind.value).toBe("image");
  });
});
