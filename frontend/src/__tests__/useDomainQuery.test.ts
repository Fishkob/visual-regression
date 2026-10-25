import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import {
  useDomainQuery,
  useSdkQuery,
  usePagedListQuery,
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

describe("retry option", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryOptions.current = undefined;
  });

  const noRetry = () =>
    expect(queryOptions.current).not.toHaveProperty("retry");

  it("omits retry for useDomainQuery when the caller does not set it", () => {
    useDomainQuery({
      queryKey: ["projects"],
      queryFn: () => Promise.resolve([] as unknown[]),
    });

    noRetry();
  });

  it("omits retry for useSdkQuery when the caller does not set it", () => {
    useSdkQuery({
      args: { projectName: ref("my-project") },
      required: ["projectName"],
      keyOf: ({ projectName }) => ["detail", projectName],
      sdkFn: () => Promise.resolve({ data: {} }),
      map: (data: unknown) => data,
    });

    noRetry();
  });

  it("omits retry for usePagedListQuery when the caller does not set it", () => {
    usePagedListQuery({
      queryKey: ["projects", 1],
      page: 1,
      pageSize: 20,
      fetchPage: () =>
        Promise.resolve({ data: { data: [], meta: { total: 0 } } }),
      map: (items: unknown[]) => items,
    });

    noRetry();
  });

  it("omits retry for usePaginatedListQuery when the caller does not set it", () => {
    usePaginatedListQuery({
      queryKey: ["projects"],
      fetchPage: () =>
        Promise.resolve({ data: { data: [], meta: { total: 0 } } }),
      map: (items: unknown[]) => items,
    });

    noRetry();
  });

  it("passes an explicit caller retry through", () => {
    usePaginatedListQuery({
      queryKey: ["projects"],
      retry: false,
      fetchPage: () =>
        Promise.resolve({ data: { data: [], meta: { total: 0 } } }),
      map: (items: unknown[]) => items,
    });

    expect(queryOptions.current!.retry).toBe(false);
  });
});

describe("useDomainQuery live options", () => {
  it("forwards staleTime, polling and focus refetch to TanStack", () => {
    useDomainQuery({
      queryKey: ["inbox"],
      queryFn: () => Promise.resolve([] as unknown[]),
      staleTime: 0,
      refetchInterval: 30_000,
      refetchOnWindowFocus: "always",
    });

    expect(queryOptions.current).toMatchObject({
      staleTime: 0,
      refetchInterval: 30_000,
      refetchOnWindowFocus: "always",
    });
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
