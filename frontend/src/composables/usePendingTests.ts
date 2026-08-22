import { computed, unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { testsQueriesControllerGetTestsWithPendingStatus } from "@sdk";
import type { PendingTestDto } from "@sdk";
import type { PendingTest } from "@/domains/pending-tests/pending-test";
import { mapPendingTests } from "@/domains/pending-tests/pending-test";
import { pendingTestQueryKeys } from "@/domains/pending-tests/query-keys";
import { keyOf } from "@/lib/variant-key";
import {
  usePaginatedListQuery,
  type MaybeRef,
} from "@/composables/useDomainQuery";

// Fetches the complete pending list for a project, paging past the first page.
// The review session walks every pending test, so a truncated page would
// silently end the pass at the /done page with tests still awaiting review.
export function usePendingTestsQuery(
  projectName: MaybeRef<string>,
  enabled: MaybeRef<boolean> = true,
) {
  const nameRef = computed(() => unref(projectName));
  return usePaginatedListQuery<PendingTestDto, PendingTest>({
    queryKey: computed(() =>
      nameRef.value ? pendingTestQueryKeys.list(nameRef.value) : [],
    ),
    enabled,
    fetchPage: (skip, take) => {
      const name = nameRef.value;
      if (!name) return Promise.resolve({ data: [], meta: { total: 0 } });
      return testsQueriesControllerGetTestsWithPendingStatus({
        path: { projectName: name },
        query: { skip, take },
      });
    },
    map: mapPendingTests,
  });
}

// Single owner of the pending-list cache write. The review session must remove
// the approved/skipped test from the pending cache optimistically; it does so
// through this seam instead of hand-rolling cancel/get/set on a query it does
// not own. Returns the previous value + query key so the caller can roll back
// on failure.
export async function optimisticallyRemovePendingTest(
  client: QueryClient,
  projectName: string,
  currentKey: string,
): Promise<{
  previous: PendingTest[] | undefined;
  keys: readonly string[];
}> {
  const keys = pendingTestQueryKeys.list(projectName);
  await client.cancelQueries({ queryKey: keys });
  const previous = client.getQueryData<PendingTest[]>(keys);
  client.setQueryData<PendingTest[]>(keys, (old) =>
    (old ?? []).filter((t) => keyOf(t) !== currentKey),
  );
  return { previous, keys };
}

export function restorePendingTestCache(
  client: QueryClient,
  keys: readonly string[],
  previous: PendingTest[] | undefined,
): void {
  if (previous) {
    client.setQueryData(keys, previous);
  }
}
