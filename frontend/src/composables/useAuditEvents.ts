import { computed, unref } from "vue";
import { auditControllerList, type PaginatedAuditEventDto } from "@sdk";
import { mapAuditEventPage } from "@/domains/audit/audit-event.mapper";
import type {
  AuditEventsQuery,
  AuditFilters,
} from "@/domains/audit/audit-event.model";
import { auditQueryKeys } from "@/domains/audit/query-keys";
import { AUDIT_PAGE_SIZE } from "@/lib/pagination";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";

// The global trail, server-filtered and server-paged. Filters stay reactive so
// the view keeps the draft inputs it applies; the query key carries them, which
// is what makes an Apply fetch the matching page instead of reusing a cache
// entry from the previous filter set.
export function useAuditEvents(
  filters: MaybeRef<AuditFilters>,
  page: MaybeRef<number>,
  limit: number = AUDIT_PAGE_SIZE,
) {
  const query = computed<AuditEventsQuery>(() => ({
    ...unref(filters),
    page: Math.max(1, unref(page) || 1),
    limit,
  }));

  return useSdkQuery({
    args: { query },
    required: ["query"],
    keyOf: ({ query }) => auditQueryKeys.list(query),
    sdkFn: ({ query }) => auditControllerList({ query }),
    map: (data: PaginatedAuditEventDto | undefined) => mapAuditEventPage(data),
  });
}
