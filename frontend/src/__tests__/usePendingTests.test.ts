import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { testsQueriesControllerGetTestsWithPendingStatus } from "@sdk";
import { usePendingTestsQuery } from "@/composables/usePendingTests";
import { pendingTestQueryKeys } from "@/domains/pending-tests/query-keys";

vi.mock("@sdk", () => ({
  testsQueriesControllerGetTestsWithPendingStatus: vi.fn(),
}));

const mockGetTestsWithPendingStatus =
  testsQueriesControllerGetTestsWithPendingStatus as ReturnType<typeof vi.fn>;

vi.mock("@tanstack/vue-query", () => ({
  useQuery: vi.fn((opts: { queryFn: () => Promise<unknown> }) => {
    const data = ref<PendingTest[]>();
    opts.queryFn().then((result) => {
      data.value = result as PendingTest[];
    });
    return {
      data,
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    };
  }),
}));

import type { PendingTest } from "@/domains/pending-tests/pending-test";

describe("usePendingTestsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unwraps the paginated pending response before mapping", async () => {
    mockGetTestsWithPendingStatus.mockResolvedValue({
      data: {
        data: [
          {
            name: "login-form",
            variant: {
              viewport: "1920x1080",
              browser: "Chrome",
              environment: "staging",
            },
            latestStatus: "PENDING_APPROVAL",
          },
        ],
        meta: { page: 1, limit: 100, total: 1 },
      },
    });

    const query = usePendingTestsQuery(
      ref("checkout-ui"),
      ref(undefined),
      ref(true),
    );

    await vi.waitFor(() => {
      expect(query.data.value).toEqual([
        {
          name: "login-form",
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
      ]);
    });
  });

  it("pages through the whole project before returning", async () => {
    mockGetTestsWithPendingStatus
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              name: "login-form",
              variant: { viewport: "1920x1080" },
              latestStatus: "PENDING_APPROVAL",
            },
          ],
          meta: { page: 1, limit: 1, total: 2 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              name: "signup-form",
              variant: { viewport: "1280x720" },
              latestStatus: "PENDING_APPROVAL",
            },
          ],
          meta: { page: 2, limit: 1, total: 2 },
        },
      });

    const query = usePendingTestsQuery(
      ref("checkout-ui"),
      ref(undefined),
      ref(true),
    );

    await vi.waitFor(() => {
      expect(query.data.value).toEqual([
        {
          name: "login-form",
          viewport: "1920x1080",
          browser: undefined,
          environment: undefined,
        },
        {
          name: "signup-form",
          viewport: "1280x720",
          browser: undefined,
          environment: undefined,
        },
      ]);
    });
    expect(mockGetTestsWithPendingStatus).toHaveBeenCalledTimes(2);
  });

  it("scopes the pending list to the selected branch", async () => {
    mockGetTestsWithPendingStatus.mockResolvedValue({
      data: { data: [], meta: { page: 1, limit: 100, total: 0 } },
    });

    usePendingTestsQuery(ref("checkout-ui"), ref("feature/x"), ref(true));

    await vi.waitFor(() => {
      expect(mockGetTestsWithPendingStatus).toHaveBeenCalledWith({
        path: { projectName: "checkout-ui" },
        query: { skip: 0, take: 100, branch: "feature/x" },
      });
    });
  });

  it("scopes the pending list to my assignments", async () => {
    mockGetTestsWithPendingStatus.mockResolvedValue({
      data: { data: [], meta: { page: 1, limit: 100, total: 0 } },
    });

    usePendingTestsQuery(
      ref("checkout-ui"),
      ref(undefined),
      ref(true),
      ref(true),
    );

    await vi.waitFor(() => {
      expect(mockGetTestsWithPendingStatus).toHaveBeenCalledWith({
        path: { projectName: "checkout-ui" },
        query: { skip: 0, take: 100, assignedToMe: true },
      });
    });
  });

  it("keeps the assigned scope in the cache key", async () => {
    mockGetTestsWithPendingStatus.mockResolvedValue({
      data: { data: [], meta: { page: 1, limit: 100, total: 0 } },
    });

    usePendingTestsQuery(
      ref("checkout-ui"),
      ref("feature/x"),
      ref(true),
      ref(true),
    );

    await vi.waitFor(() =>
      expect(mockGetTestsWithPendingStatus).toHaveBeenCalled(),
    );
    expect(pendingTestQueryKeys.list("checkout-ui", "feature/x", true)).toEqual(
      ["pending-tests", "list", "checkout-ui", "feature/x", "assigned-to-me"],
    );
    expect(
      pendingTestQueryKeys.list("checkout-ui", "feature/x", false),
    ).toEqual(["pending-tests", "list", "checkout-ui", "feature/x"]);
  });
});
