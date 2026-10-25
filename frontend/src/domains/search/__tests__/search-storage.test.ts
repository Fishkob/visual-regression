import { describe, expect, it, beforeEach } from "vitest";
import {
  clearRecentSearches,
  readFavoriteSearches,
  readRecentSearches,
  SEARCH_FAVORITES_KEY,
  SEARCH_RECENTS_KEY,
  writeFavoriteSearches,
  writeRecentSearches,
} from "../search-storage";
import type { SearchResultItem } from "../search.model";

const item = (id: string): SearchResultItem => ({
  id,
  kind: "project",
  label: id,
  path: `/projects/${id}`,
});

beforeEach(() => {
  localStorage.clear();
});

describe("search storage", () => {
  it("round-trips recents and favorites", () => {
    writeRecentSearches([item("a"), item("b")]);
    writeFavoriteSearches([item("c")]);

    expect(readRecentSearches().map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(readFavoriteSearches().map((entry) => entry.id)).toEqual(["c"]);
  });

  it("caps the recent list at five entries", () => {
    writeRecentSearches(
      Array.from({ length: 8 }, (_, index) => item(`id-${index}`)),
    );

    expect(readRecentSearches()).toHaveLength(5);
  });

  it("ignores corrupt JSON and invalid entries", () => {
    localStorage.setItem(SEARCH_RECENTS_KEY, "{not json");
    expect(readRecentSearches()).toEqual([]);

    localStorage.setItem(
      SEARCH_FAVORITES_KEY,
      JSON.stringify([item("a"), { id: "broken" }, "nope"]),
    );
    expect(readFavoriteSearches().map((entry) => entry.id)).toEqual(["a"]);
  });

  it("returns empty lists when nothing was stored", () => {
    expect(readRecentSearches()).toEqual([]);
    expect(readFavoriteSearches()).toEqual([]);
  });

  it("clears the recents key", () => {
    writeRecentSearches([item("a")]);

    clearRecentSearches();

    expect(readRecentSearches()).toEqual([]);
    expect(localStorage.getItem(SEARCH_RECENTS_KEY)).toBeNull();
  });
});
