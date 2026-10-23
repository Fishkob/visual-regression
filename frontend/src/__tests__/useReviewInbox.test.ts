import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/vue-query";
import {
  useReviewInboxCountQuery,
  withReviewInboxItemRemoved,
} from "@/composables/useReviewInbox";
import type { ReviewInboxItem } from "@/domains/pending-tests/review-inbox.model";
import { reviewInboxQueryKeys } from "@/domains/pending-tests/query-keys";

const { mockUseQuery, queryOptions } = vi.hoisted(() => {
  const queryOptions: {
    current?: {
      queryKey: { value: unknown };
      queryFn: () => Promise<unknown>;
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
}));

vi.mock("@sdk", () => ({
  reviewInboxControllerGetPending: (...args: unknown[]) =>
    mockGetPending(...args),
}));

const key = ["review-inbox", "list"];

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
});

const inboxItem = (comparisonId: string): ReviewInboxItem => ({
  comparisonId,
  projectName: "p",
  testName: "t",
  kind: "image",
  mismatchPixelCount: 1,
  createdAt: "2026-10-20T10:00:00.000Z",
});

function makeClient(previous: ReviewInboxItem[] | undefined) {
  const cancelQueries = vi.fn().mockResolvedValue(undefined);
  const getQueryData = vi.fn().mockReturnValue(previous);
  const setQueryData = vi.fn();
  return {
    client: {
      cancelQueries,
      getQueryData,
      setQueryData,
    } as unknown as QueryClient,
    cancelQueries,
    getQueryData,
    setQueryData,
  };
}

describe("withReviewInboxItemRemoved", () => {
  it("cancels the inbox query and filters the matching item", async () => {
    const previous = [inboxItem("a"), inboxItem("b"), inboxItem("c")];
    const { client, cancelQueries, getQueryData, setQueryData } =
      makeClient(previous);

    await withReviewInboxItemRemoved(client, "b");

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: key });
    expect(getQueryData).toHaveBeenCalledWith(key);
    expect(setQueryData).toHaveBeenCalledWith(key, expect.any(Function));

    const update = setQueryData.mock.calls[0][1] as (
      old: ReviewInboxItem[] | undefined,
    ) => ReviewInboxItem[];
    expect(update(previous).map((item) => item.comparisonId)).toEqual([
      "a",
      "c",
    ]);
  });

  it("restores the previous snapshot", async () => {
    const previous = [inboxItem("a")];
    const { client, setQueryData } = makeClient(previous);

    const { restore } = await withReviewInboxItemRemoved(client, "a");
    restore();

    expect(setQueryData).toHaveBeenLastCalledWith(key, previous);
  });

  it("does not restore when there was no previous snapshot", async () => {
    const { client, setQueryData } = makeClient(undefined);

    const { restore } = await withReviewInboxItemRemoved(client, "a");
    expect(setQueryData).toHaveBeenCalledTimes(1);

    restore();

    expect(setQueryData).toHaveBeenCalledTimes(1);
  });
});
