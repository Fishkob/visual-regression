import {
  readPersistedJson,
  removePersistedKey,
  writePersistedJson,
} from "@/lib/persisted-json";
import {
  isSearchResultItem,
  SEARCH_RECENT_LIMIT,
  type SearchResultItem,
} from "./search.model";

// Versioned keys: a future shape change can start from a clean slate instead of
// trying to migrate entries written by an older build.
export const SEARCH_RECENTS_KEY = "vrt-search-recents-v1";
export const SEARCH_FAVORITES_KEY = "vrt-search-favorites-v1";

// The persisted payload is user-editable JSON, so every entry is re-validated;
// an unknown kind or a missing path is dropped rather than rendered as a dead
// button.
function parseEntries(value: unknown): SearchResultItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isSearchResultItem).slice(0, 50);
}

export function readRecentSearches(): SearchResultItem[] {
  return (
    readPersistedJson(SEARCH_RECENTS_KEY, parseEntries)?.slice(
      0,
      SEARCH_RECENT_LIMIT,
    ) ?? []
  );
}

export function writeRecentSearches(
  entries: readonly SearchResultItem[],
): void {
  writePersistedJson(SEARCH_RECENTS_KEY, entries.slice(0, SEARCH_RECENT_LIMIT));
}

export function clearRecentSearches(): void {
  removePersistedKey(SEARCH_RECENTS_KEY);
}

export function readFavoriteSearches(): SearchResultItem[] {
  return readPersistedJson(SEARCH_FAVORITES_KEY, parseEntries) ?? [];
}

export function writeFavoriteSearches(
  entries: readonly SearchResultItem[],
): void {
  writePersistedJson(SEARCH_FAVORITES_KEY, entries);
}
