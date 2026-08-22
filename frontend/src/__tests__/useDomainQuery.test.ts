import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useSdkQuery } from "@/composables/useDomainQuery";

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
});
