import { beforeEach, describe, expect, it, vi } from "vitest";
import { unref } from "vue";
import {
  RUN_DETAIL_POLL_INTERVAL_MS,
  useRunDetail,
  useRuns,
} from "@/composables/useRuns";
import { runsQueryKeys } from "@/domains/runs/query-keys";

const { mockUseQuery, queryOptions, mockList, mockDetail } = vi.hoisted(() => {
  const queryOptions: {
    current?: {
      queryKey: { value: unknown };
      queryFn: () => Promise<unknown>;
      refetchInterval?:
        | number
        | false
        | ((query: {
            state: { data?: unknown };
          }) => number | false | undefined);
    };
  } = {};
  const mockUseQuery = vi.fn(
    (options: NonNullable<typeof queryOptions.current>) => {
      queryOptions.current = options;
      return {
        data: { value: undefined },
        isLoading: false,
        error: { value: null },
      };
    },
  );
  return {
    mockUseQuery,
    queryOptions,
    mockList: vi.fn(),
    mockDetail: vi.fn(),
  };
});

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  keepPreviousData: (previous: unknown) => previous,
}));

vi.mock("@sdk", () => ({
  runsControllerList: (...args: unknown[]) => mockList(...args),
  runsControllerDetail: (...args: unknown[]) => mockDetail(...args),
  runsControllerFinish: vi.fn(),
  runsControllerApproveAll: vi.fn(),
}));

const runDto = (overrides: Record<string, unknown> = {}) => ({
  id: "run-1",
  key: "ci-42",
  branchName: "main",
  commitSha: "0123456",
  commitMessage: "Fix",
  ciUrl: null,
  createdAt: "2026-10-20T10:00:00.000Z",
  lastActivityAt: "2026-10-20T10:05:00.000Z",
  finishedAt: null,
  finishedBy: null,
  ...overrides,
});

const detailDto = (state: string) => ({
  run: runDto(),
  status: {
    state,
    pendingComparisons: 1,
    pendingJobs: 0,
    failedJobs: 0,
    approved: 0,
    testCount: 1,
  },
  pending: [],
  approvals: [],
  uploads: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  queryOptions.current = undefined;
});

describe("useRuns", () => {
  it("keys and fetches one branch/page of runs", async () => {
    mockList.mockResolvedValue({
      data: {
        data: [runDto()],
        meta: {
          page: 2,
          limit: 20,
          total: 21,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      },
    });

    useRuns("checkout", "release", 2);

    const options = queryOptions.current!;
    expect(unref(options.queryKey)).toEqual(
      runsQueryKeys.list("checkout", {
        page: 2,
        limit: 20,
        branch: "release",
      }),
    );

    const page = (await options.queryFn()) as {
      items: { key: string }[];
      total: number;
      totalPages: number;
    };
    expect(mockList).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      query: { page: 2, limit: 20, branch: "release" },
    });
    expect(page.items[0].key).toBe("ci-42");
    expect(page.total).toBe(21);
    expect(page.totalPages).toBe(2);
  });

  it("omits the branch when the filter is all branches", async () => {
    mockList.mockResolvedValue({
      data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    });

    useRuns("checkout", undefined, 1);

    expect(unref(queryOptions.current!.queryKey)).toEqual(
      runsQueryKeys.list("checkout", { page: 1, limit: 20 }),
    );
    await queryOptions.current!.queryFn();

    expect(mockList).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      query: { page: 1, limit: 20 },
    });
  });
});

describe("useRunDetail", () => {
  it("reads the status from the detail payload", async () => {
    mockDetail.mockResolvedValue({ data: detailDto("pending") });

    useRunDetail("checkout", "ci-42", "main");

    const options = queryOptions.current!;
    expect(unref(options.queryKey)).toEqual(
      runsQueryKeys.detail("checkout", "ci-42", "main"),
    );

    const detail = (await options.queryFn()) as {
      run: { key: string };
      status: { state: string };
    };
    expect(mockDetail).toHaveBeenCalledWith({
      path: { projectName: "checkout", runKey: "ci-42" },
      query: { branch: "main" },
    });
    expect(detail.run.key).toBe("ci-42");
    expect(detail.status.state).toBe("pending");
  });

  it("polls while the run is live and stops when it is terminal", async () => {
    useRunDetail("checkout", "ci-42", undefined);

    const interval = queryOptions.current!.refetchInterval;
    expect(typeof interval).toBe("function");
    if (typeof interval !== "function") return;

    const detail = detailDto("open");
    expect(interval({ state: { data: detail } })).toBe(
      RUN_DETAIL_POLL_INTERVAL_MS,
    );
    expect(
      interval({
        state: {
          data: { ...detail, status: { ...detail.status, state: "pending" } },
        },
      }),
    ).toBe(RUN_DETAIL_POLL_INTERVAL_MS);
    expect(
      interval({
        state: {
          data: { ...detail, status: { ...detail.status, state: "passed" } },
        },
      }),
    ).toBe(false);
    expect(
      interval({
        state: {
          data: { ...detail, status: { ...detail.status, state: "failed" } },
        },
      }),
    ).toBe(false);
    expect(interval({ state: { data: undefined } })).toBe(false);
  });
});
