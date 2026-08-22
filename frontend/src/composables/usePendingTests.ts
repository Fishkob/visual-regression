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
    fetchPage: (skip, take) =>
      testsQueriesControllerGetTestsWithPendingStatus({
        path: { projectName: nameRef.value },
        query: { skip, take },
      }),
    map: mapPendingTests,
  });
}

// Single owner of the pending-list cache write, including its two-phase
// transaction. The review session removes the approved/skipped test from the
// pending cache optimistically; it does so through this seam instead of
// hand-rolling the cancel/get/set/rollback pairing on a query it does not own.
// Returns a `restore` closure that replays the pre-removal snapshot, so the
// caller never touches the previous/keys artifacts themselves.
export async function withPendingTestRemoved(
  client: QueryClient,
  projectName: string,
  currentKey: string,
): Promise<{ restore: () => void }> {
  const keys = pendingTestQueryKeys.list(projectName);
  await client.cancelQueries({ queryKey: keys });
  const previous = client.getQueryData<PendingTest[]>(keys);
  client.setQueryData<PendingTest[]>(keys, (old) =>
    (old ?? []).filter((t) => keyOf(t) !== currentKey),
  );
  return {
    restore: () => {
      if (previous) {
        client.setQueryData(keys, previous);
      }
    },
  };
}
