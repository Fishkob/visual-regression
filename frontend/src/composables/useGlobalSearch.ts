import { onScopeDispose, ref, unref, watch } from "vue";
import { keepPreviousData } from "@tanstack/vue-query";
import { searchControllerQuery, type SearchResultsDto } from "@sdk";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { mapSearchResults } from "@/domains/search/search.mapper";
import type { SearchResults } from "@/domains/search/search.model";
import { SEARCH_DEBOUNCE_MS } from "@/domains/search/search.model";
import { searchQueryKeys } from "@/domains/search/query-keys";

// Only the settled, non-empty query reaches the server: the backend answers 422
// for an empty q, and a request per keystroke would be worse than useless for a
// palette. `enabled` lets the palette stay closed without any request at all.
export function useGlobalSearch(
  query: MaybeRef<string>,
  enabled: MaybeRef<boolean> = true,
) {
  const settledQuery = ref("");
  let timer: number | undefined;

  watch(
    () => unref(query).trim(),
    (value) => {
      if (timer) window.clearTimeout(timer);
      // Clearing the box is immediate: there is nothing to debounce and the
      // palette switches back to recents/favorites.
      if (!value) {
        settledQuery.value = "";
        return;
      }
      timer = window.setTimeout(() => {
        settledQuery.value = value;
      }, SEARCH_DEBOUNCE_MS);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    if (timer) window.clearTimeout(timer);
  });

  return useSdkQuery({
    args: { q: settledQuery },
    required: ["q"],
    enabled,
    placeholderData: keepPreviousData,
    keyOf: ({ q }) => searchQueryKeys.query(q),
    sdkFn: ({ q }) => searchControllerQuery({ query: { q } }),
    map: (dto: SearchResultsDto | undefined): SearchResults =>
      mapSearchResults(dto),
  });
}
