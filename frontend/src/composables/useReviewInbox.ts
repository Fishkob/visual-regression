import { computed } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { reviewInboxControllerGetPending, type PendingReviewDto } from "@sdk";
import {
  usePaginatedListQuery,
  useDomainQuery,
} from "@/composables/useDomainQuery";
import { unwrapSdkData } from "@/lib/sdk";
import { reviewInboxQueryKeys } from "@/domains/pending-tests/query-keys";
import { mapReviewInbox } from "@/domains/pending-tests/review-inbox.mapper";
import { groupReviewInbox } from "@/domains/pending-tests/group-review-inbox";
import type { ReviewInboxItem } from "@/domains/pending-tests/review-inbox.model";

export function useReviewInboxQuery() {
  return usePaginatedListQuery<PendingReviewDto, ReviewInboxItem>({
    queryKey: reviewInboxQueryKeys.list(),
    fetchPage: (skip, take) =>
      reviewInboxControllerGetPending({ query: { skip, take } }),
    map: mapReviewInbox,
  });
}

export function useReviewInboxSections() {
  const query = useReviewInboxQuery();
  const sections = computed(() => groupReviewInbox(query.data.value ?? []));
  return { ...query, sections };
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

export async function withReviewInboxItemRemoved(
  client: QueryClient,
  comparisonId: string,
): Promise<{ restore: () => void }> {
  const key = reviewInboxQueryKeys.list();
  await client.cancelQueries({ queryKey: key });
  const previous = client.getQueryData<ReviewInboxItem[]>(key);
  client.setQueryData<ReviewInboxItem[]>(key, (old) =>
    (old ?? []).filter((item) => item.comparisonId !== comparisonId),
  );
  return {
    restore: () => {
      if (previous) {
        client.setQueryData(key, previous);
      }
    },
  };
}
