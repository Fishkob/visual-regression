import { computed, unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { testsQueriesControllerGetTestsWithPendingStatus } from "@sdk";
import type { PendingTestDto } from "@sdk";
import type { PendingTest } from "@/domains/pending-tests/pending-test";
import { mapPendingTests } from "@/domains/pending-tests/pending-test";
import {
  pendingTestQueryKeys,
  type PendingTestFilters,
} from "@/domains/pending-tests/query-keys";
import { keyOf } from "@/lib/variant-key";
import {
  usePaginatedListQuery,
  type MaybeRef,
} from "@/composables/useDomainQuery";

// Fetches the complete pending list for a project (optionally scoped to one
// branch and to the reviewer's own assignments), paging past the first page. The
// review session walks every pending test, so a truncated page would silently
// end the pass at the /done page with tests still awaiting review. The
// assigned-only scope must reach the server: a pass started from "My reviews"
// walks that subset and nothing else.
export function usePendingTestsQuery(
  projectName: MaybeRef<string>,
  branchName: MaybeRef<string | undefined> = undefined,
  enabled: MaybeRef<boolean> = true,
  assignedToMe: MaybeRef<boolean> = false,
  filters: MaybeRef<PendingTestFilters | undefined> = undefined,
) {
  const nameRef = computed(() => unref(projectName));
  const branchRef = computed(() => unref(branchName));
  const assignedRef = computed(() => unref(assignedToMe));
  const filtersRef = computed<PendingTestFilters>(() => unref(filters) ?? {});
  return usePaginatedListQuery<PendingTestDto, PendingTest>({
    queryKey: computed(() =>
      nameRef.value
        ? pendingTestQueryKeys.list(
            nameRef.value,
            branchRef.value,
            assignedRef.value,
            filtersRef.value,
          )
        : [],
    ),
    enabled,
    fetchPage: (skip, take) =>
      testsQueriesControllerGetTestsWithPendingStatus({
        path: { projectName: nameRef.value },
        query: {
          skip,
          take,
          ...(branchRef.value ? { branch: branchRef.value } : {}),
          ...(assignedRef.value ? { assignedToMe: true } : {}),
          ...(filtersRef.value.kind ? { kind: filtersRef.value.kind } : {}),
          ...(filtersRef.value.q ? { q: filtersRef.value.q } : {}),
          ...(filtersRef.value.runKey
            ? { runKey: filtersRef.value.runKey }
            : {}),
          ...(filtersRef.value.tag ? { tag: filtersRef.value.tag } : {}),
        },
      }),
    map: mapPendingTests,
  });
}

// Single owner of the pending-list cache write, including its two-phase
// transaction. The review session removes the approved/skipped test from the
// pending cache optimistically; it does so through this seam instead of
// hand-rolling the cancel/get/set/rollback pairing on a query it does not own.
// The branch and the assigned-only scope are part of the targeted key so a
// scoped pass never mutates another scope's cache. Returns a `restore` closure
// that replays the pre-removal snapshot, so the caller never touches the
// previous/keys artifacts themselves.
export async function withPendingTestRemoved(
  client: QueryClient,
  projectName: string,
  branchName: string | undefined,
  currentKey: string,
  assignedToMe = false,
  filters: PendingTestFilters = {},
): Promise<{ restore: () => void }> {
  const keys = pendingTestQueryKeys.list(
    projectName,
    branchName,
    assignedToMe,
    filters,
  );
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
