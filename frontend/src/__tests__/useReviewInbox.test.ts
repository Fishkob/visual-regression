import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/vue-query";
import {
  useReviewInboxCountQuery,
  withReviewInboxItemRemoved,
} from "@/composables/useReviewInbox";
import type { PagedList } from "@/composables/useDomainQuery";
import type { ReviewInboxItem } from "@/domains/pending-tests/review-inbox.model";
import { reviewInboxQueryKeys } from "@/domains/pending-tests/query-keys";

const { mockUseQuery, queryOptions } = vi.hoisted(() => {
  const queryOptions: {
    current?: {
      queryKey: { value: unknown };
      queryFn: () => Promise<unknown>;
      staleTime?: number;
      refetchInterval?: number | false;
      refetchOnWindowFocus?: boolean | "always";
    };
  } = {};
  const mockUseQuery = vi.fn(
    (opts: NonNullable<typeof queryOptions.current>) => {
      queryOptions.current = opts;
      return { data: undefined, isLoading: false, error: null };
    },
  );
  return { mockUseQuery, queryOptions };
});

const mockGetPending = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
  keepPreviousData: (previous: unknown) => previous,
}));

vi.mock("@sdk", () => ({
  reviewInboxControllerGetBranches: vi.fn(),
  reviewInboxControllerGetPending: (...args: unknown[]) =>
    mockGetPending(...args),
}));

const listPrefix = reviewInboxQueryKeys.lists();

describe("useReviewInboxCountQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryOptions.current = undefined;
  });

  it("requests one item and returns meta.total", async () => {
    mockGetPending.mockResolvedValue({ data: { meta: { total: 7 } } });

    useReviewInboxCountQuery();

    expect(queryOptions.current!.queryKey.value).toEqual(
      reviewInboxQueryKeys.count(),
    );
    const result = await queryOptions.current!.queryFn();

    expect(mockGetPending).toHaveBeenCalledWith({
      query: { skip: 0, take: 1 },
    });
    expect(result).toBe(7);
  });

  it("polls the live count and refetches when the tab regains focus", () => {
    useReviewInboxCountQuery();

    expect(queryOptions.current!.staleTime).toBe(0);
    expect(queryOptions.current!.refetchInterval).toBe(30_000);
    expect(queryOptions.current!.refetchOnWindowFocus).toBe("always");
  });
});

const inboxItem = (comparisonId: string): ReviewInboxItem => ({
  comparisonId,
  projectName: "p",
  testName: "t",
  kind: "image",
  branchName: "main",
  isDefaultBranch: true,
  mismatchPixelCount: 1,
  createdAt: "2026-10-20T10:00:00.000Z",
});

function page(items: ReviewInboxItem[]): PagedList<ReviewInboxItem> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

function makeClient(previous: [unknown, PagedList<ReviewInboxItem>][]) {
  const cancelQueries = vi.fn().mockResolvedValue(undefined);
  const getQueriesData = vi.fn().mockReturnValue(previous);
  const setQueriesData = vi.fn();
  const setQueryData = vi.fn();
  return {
    client: {
      cancelQueries,
      getQueriesData,
      setQueriesData,
      setQueryData,
    } as unknown as QueryClient,
    cancelQueries,
    getQueriesData,
    setQueriesData,
    setQueryData,
  };
}

describe("withReviewInboxItemRemoved", () => {
  it("cancels the inbox lists and filters the matching item from every page", async () => {
    const pageKey = reviewInboxQueryKeys.list({ page: 1 });
    const previous: [unknown, PagedList<ReviewInboxItem>][] = [
      [pageKey, page([inboxItem("a"), inboxItem("b"), inboxItem("c")])],
    ];
    const { client, cancelQueries, getQueriesData, setQueriesData } =
      makeClient(previous);

    await withReviewInboxItemRemoved(client, "b");

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: listPrefix });
    expect(getQueriesData).toHaveBeenCalledWith({ queryKey: listPrefix });
    expect(setQueriesData).toHaveBeenCalledWith(
      { queryKey: listPrefix },
      expect.any(Function),
    );

    const update = setQueriesData.mock.calls[0][1] as (
      old: PagedList<ReviewInboxItem> | undefined,
    ) => PagedList<ReviewInboxItem> | undefined;
    const next = update(previous[0][1]);
    expect(next?.items.map((item) => item.comparisonId)).toEqual(["a", "c"]);
    expect(next?.total).toBe(2);
  });

  it("leaves a page that does not contain the item untouched", async () => {
    const { client, setQueriesData } = makeClient([]);
    await withReviewInboxItemRemoved(client, "missing");

    const update = setQueriesData.mock.calls[0][1] as (
      old: PagedList<ReviewInboxItem> | undefined,
    ) => PagedList<ReviewInboxItem> | undefined;
    const current = page([inboxItem("a")]);

    expect(update(current)).toBe(current);
  });

  it("restores every previous page snapshot", async () => {
    const previous: [unknown, PagedList<ReviewInboxItem>][] = [
      [reviewInboxQueryKeys.list({ page: 1 }), page([inboxItem("a")])],
      [reviewInboxQueryKeys.list({ page: 2 }), page([inboxItem("b")])],
    ];
    const { client, setQueryData } = makeClient(previous);

    const { restore } = await withReviewInboxItemRemoved(client, "a");
    restore();

    expect(setQueryData).toHaveBeenCalledWith(
      reviewInboxQueryKeys.list({ page: 1 }),
      previous[0][1],
    );
    expect(setQueryData).toHaveBeenCalledWith(
      reviewInboxQueryKeys.list({ page: 2 }),
      previous[1][1],
    );
  });

  it("does not restore when there was no previous snapshot", async () => {
    const { client, setQueryData } = makeClient([]);

    const { restore } = await withReviewInboxItemRemoved(client, "a");
    restore();

    expect(setQueryData).not.toHaveBeenCalled();
  });
});
