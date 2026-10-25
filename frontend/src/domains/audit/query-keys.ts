import type { AuditEventsQuery } from "./audit-event.model";

export const auditQueryKeys = {
  all: () => ["audit"] as const,
  // Filters and page are part of the key, so each filtered page is its own
  // cache entry instead of reusing the previous (unfiltered or earlier) page.
  // Omitting the query yields the list prefix, which invalidates every entry.
  list: (query?: AuditEventsQuery) =>
    (query
      ? [...auditQueryKeys.all(), "list", query]
      : [...auditQueryKeys.all(), "list"]) as readonly unknown[],
} as const;
