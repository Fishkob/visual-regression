export const searchQueryKeys = {
  all: () => ["search"] as const,
  // Each query string is its own cache entry (keepPreviousData keeps the old
  // one on screen while the new answer loads). all() invalidates every query.
  query: (q: string) => [...searchQueryKeys.all(), "query", q] as const,
} as const;
