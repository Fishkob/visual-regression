import { computed, unref } from "vue";
import { keepPreviousData } from "@tanstack/vue-query";
import type { QueryClient } from "@tanstack/vue-query";
import {
  reviewInboxControllerGetBranches,
  reviewInboxControllerGetPending,
  type PendingReviewDto,
} from "@sdk";
import {
  usePagedListQuery,
  useDomainQuery,
  type MaybeRef,
  type PagedList,
} from "@/composables/useDomainQuery";
import { unwrapSdkData } from "@/lib/sdk";
import { INBOX_PAGE_SIZE } from "@/lib/pagination";
import {
  reviewInboxQueryKeys,
  type InboxListQuery,
} from "@/domains/pending-tests/query-keys";
import { mapReviewInbox } from "@/domains/pending-tests/review-inbox.mapper";
import { groupReviewInbox } from "@/domains/pending-tests/group-review-inbox";
import type { ReviewInboxItem } from "@/domains/pending-tests/review-inbox.model";

// One server page of the inbox. Grouping happens over that page; the filters
// and the page live in the query so the list never fetches every comparison.
export function useReviewInboxQuery(
  query: MaybeRef<InboxListQuery> = { page: 1 },
) {
  const queryRef = computed(() => unref(query));
  return usePagedListQuery<PendingReviewDto, ReviewInboxItem>({
    queryKey: computed(() => reviewInboxQueryKeys.list(queryRef.value)),
    page: computed(() => queryRef.value.page ?? 1),
    pageSize: INBOX_PAGE_SIZE,
    placeholderData: keepPreviousData,
    fetchPage: (skip, take) =>
      reviewInboxControllerGetPending({
        query: {
          skip,
          take,
          ...(queryRef.value.q ? { q: queryRef.value.q } : {}),
          ...(queryRef.value.kind ? { kind: queryRef.value.kind } : {}),
          ...(queryRef.value.groupId
            ? { groupId: queryRef.value.groupId }
            : {}),
          ...(queryRef.value.branch ? { branch: queryRef.value.branch } : {}),
        },
      }),
    map: mapReviewInbox,
  });
}

export function useReviewInboxSections(
  query: MaybeRef<InboxListQuery> = { page: 1 },
) {
  const result = useReviewInboxQuery(query);
  const items = computed(() => result.data.value?.items ?? []);
  const sections = computed(() => groupReviewInbox(items.value));
  const total = computed(() => result.data.value?.total ?? 0);
  return { ...result, items, sections, total };
}

// The filter's branch choices come from the pending set, not from the current
// page, so pagination cannot hide a branch from the dropdown.
export function useInboxBranchesQuery() {
  return useDomainQuery<string[]>({
    queryKey: reviewInboxQueryKeys.branches(),
    queryFn: async () => {
      const response = await reviewInboxControllerGetBranches();
      return unwrapSdkData<string[]>(response) ?? [];
    },
  });
}

export function useReviewInboxCountQuery() {
  return useDomainQuery<number>({
    queryKey: reviewInboxQueryKeys.count(),
    queryFn: async () => {
      const response = await reviewInboxControllerGetPending({
        query: { skip: 0, take: 1 },
      });
      const page = unwrapSdkData<{ meta?: { total?: number } }>(response);
      return page?.meta?.total ?? 0;
    },
  });
}

// The review session removes an approved/skipped item optimistically. With
// paginated keys the cache holds one entry per page/filter combination, so the
// write targets every cached list under the prefix and restores all of them on
// rollback.
export async function withReviewInboxItemRemoved(
  client: QueryClient,
  comparisonId: string,
): Promise<{ restore: () => void }> {
  const key = reviewInboxQueryKeys.lists();
  await client.cancelQueries({ queryKey: key });
  const previous = client.getQueriesData<PagedList<ReviewInboxItem>>({
    queryKey: key,
  });

  client.setQueriesData<PagedList<ReviewInboxItem>>(
    { queryKey: key },
    (old) => {
      if (!old?.items) return old;
      const items = old.items.filter(
        (item) => item.comparisonId !== comparisonId,
      );
      if (items.length === old.items.length) return old;
      return { ...old, items, total: Math.max(0, old.total - 1) };
    },
  );

  return {
    restore: () => {
      for (const [queryKey, data] of previous) {
        if (data) client.setQueryData(queryKey, data);
      }
    },
  };
}
