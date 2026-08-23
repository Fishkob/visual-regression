import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import {
  useSdkQuery,
  usePaginatedListQuery,
  previewSdkRead,
} from "@/composables/useDomainQuery";
const { mockUseQuery, queryOptions } = vi.hoisted(() => {
  const queryOptions: { current?: Record<string, any> } = {};
  const mockUseQuery = vi.fn((opts: Record<string, unknown>) => {
    queryOptions.current = opts;
    return {
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
  });
  return { mockUseQuery, queryOptions };
});

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
}));

describe("useSdkQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryOptions.current = undefined;
  });

  it("gates the query until every required arg is truthy", () => {
    const projectName = ref<string>("");

    useSdkQuery({
      args: { projectName },
      required: ["projectName"],
      keyOf: ({ projectName }) => ["detail", projectName],
      sdkFn: () => Promise.resolve({ data: {} }),
      map: (data: { name: string } | undefined) => data,
    });

    expect(queryOptions.current!.queryKey.value).toEqual([]);

    projectName.value = "my-project";

    expect(queryOptions.current!.queryKey.value).toEqual([
      "detail",
      "my-project",
    ]);
  });

  it("passes narrowed (non-null) required args to the sdk function", async () => {
    const sdkFn = vi.fn(() => Promise.resolve({ data: { name: "x" } }));
    const projectName = ref<string | undefined>(undefined);

    useSdkQuery({
      args: { projectName },
      required: ["projectName"],
      keyOf: ({ projectName }) => ["detail", projectName],
      sdkFn,
      map: (data: { name: string } | undefined) => data,
    });

    projectName.value = "my-project";

    await queryOptions.current!.queryFn();

    expect(sdkFn).toHaveBeenCalledWith({ projectName: "my-project" });
  });

  it("surfaces an SDK error response as a query error", async () => {
    const projectName = ref("my-project");
    const sdkFn = vi.fn(() =>
      Promise.resolve({ error: { message: "Internal server error" } }),
    );

    useSdkQuery({
      args: { projectName },
      required: ["projectName"],
      keyOf: ({ projectName }) => ["detail", projectName],
      sdkFn,
      map: (data: unknown) => data,
    });

    await expect(queryOptions.current!.queryFn()).rejects.toThrow(
      "Internal server error",
    );
  });

  it("does not treat an empty 200 body as an error", async () => {
    const projectName = ref("my-project");

    useSdkQuery({
      args: { projectName },
      required: ["projectName"],
      keyOf: ({ projectName }) => ["detail", projectName],
      sdkFn: () => Promise.resolve({ data: {} }),
      map: (data: { kind?: string } | undefined) => data?.kind ?? null,
    });

    await expect(queryOptions.current!.queryFn()).resolves.toBeNull();
  });
});

describe("usePaginatedListQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryOptions.current = undefined;
  });

  it("surfaces an SDK error response as a query error", async () => {
    usePaginatedListQuery({
      queryKey: ["projects", "pending"],
      fetchPage: () =>
        Promise.resolve({ error: { message: "Internal server error" } }),
      map: (items: unknown[]) => items,
    });

    await expect(queryOptions.current!.queryFn()).rejects.toThrow(
      "Internal server error",
    );
  });

  it("maps an empty page list without error", async () => {
    usePaginatedListQuery({
      queryKey: ["projects", "pending"],
      fetchPage: () =>
        Promise.resolve({ data: { data: [], meta: { total: 0 } } }),
      map: (items: unknown[]) => items,
    });

    await expect(queryOptions.current!.queryFn()).resolves.toEqual([]);
  });
});

describe("previewSdkRead", () => {
  it("unwraps the data payload like the query seam", async () => {
    const result = await previewSdkRead<{ autoAcceptedCount: number }>(() =>
      Promise.resolve({ data: { autoAcceptedCount: 3 } }),
    );

    expect(result).toEqual({ autoAcceptedCount: 3 });
  });

  it("returns null when the response has no data member", async () => {
    const result = await previewSdkRead(() => Promise.resolve({}));

    expect(result).toBeNull();
  });

  it("returns null when the sdk call rejects", async () => {
    const result = await previewSdkRead<{ autoAcceptedCount: number }>(() =>
      Promise.reject(new Error("boom")),
    );

    expect(result).toBeNull();
  });
});
