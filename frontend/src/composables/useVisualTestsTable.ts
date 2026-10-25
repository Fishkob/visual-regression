import { ref, computed, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { VisualTestItem } from "@/domains/projects/project.model";
import type { TestGroup } from "@/domains/projects/test-group";
import {
  countStatuses,
  iconFor,
  isPendingApproval,
  TEST_STATUS_PRIORITY,
  FILTER_ALL,
  STATUS_FILTER_PENDING,
  STATUS_FILTER_OK,
  type VisualTestFilters,
} from "@/domains/test-status";
import { groupRowsByTestName } from "@/domains/projects/group-rows-by-test-name";
import { IMAGE_TEST_KIND } from "@/domains/test-kind";
import type { ProjectFilterOptions } from "@/domains/projects/project.model";

// The visual-tests table's derived state has one owner: the filter vocabulary,
// the filter state, and the grouping all live here, so the derive→filter→group
// pipeline stops being threaded across modules. The group shape lives in the
// projects domain (test-group.ts) — TestAccordionGroups renders those same
// values rather than re-declaring silently-driftable twins.

export interface VisualTestsTableOptions {
  tests: Ref<VisualTestItem[]>;
  syncUrl?: boolean;
  // The page already holds one server-filtered page: do not filter again, and
  // take the dropdown values from the branch-wide options the API returns.
  serverFiltered?: boolean;
  filterOptions?: Ref<ProjectFilterOptions | undefined>;
}

function emptyFilters(): VisualTestFilters {
  return {
    search: "",
    browser: FILTER_ALL,
    viewport: FILTER_ALL,
    status: FILTER_ALL,
    environment: FILTER_ALL,
    kind: FILTER_ALL,
  };
}

const FILTER_KEYS = [
  "search",
  "browser",
  "viewport",
  "status",
  "environment",
  "kind",
] as const;

const FILTER_QUERY_KEYS = [
  "q",
  "browser",
  "viewport",
  "status",
  "environment",
  "kind",
] as const;

function sameFilters(a: VisualTestFilters, b: VisualTestFilters): boolean {
  return FILTER_KEYS.every((key) => a[key] === b[key]);
}

function queryFromFilters(value: VisualTestFilters): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    if (key === "search") {
      if (value.search.trim()) query.q = value.search;
      continue;
    }
    const next = value[key];
    if (next !== FILTER_ALL) query[key] = next;
  }
  return query;
}

export function useVisualTestsTable(options: VisualTestsTableOptions) {
  const {
    tests,
    syncUrl = false,
    serverFiltered = false,
    filterOptions,
  } = options;
  const currentRoute = syncUrl ? useRoute() : null;
  const currentRouter = syncUrl ? useRouter() : null;

  const queryValue = (key: string, fallback = FILTER_ALL) =>
    String(currentRoute?.query[key] ?? "") || fallback;

  function filtersFromQuery(): VisualTestFilters {
    return {
      search: String(currentRoute?.query.q ?? ""),
      browser: queryValue("browser"),
      viewport: queryValue("viewport"),
      status: queryValue("status"),
      environment: queryValue("environment"),
      kind: queryValue("kind"),
    };
  }

  const filters = ref<VisualTestFilters>(
    syncUrl ? filtersFromQuery() : emptyFilters(),
  );

  if (currentRouter && currentRoute) {
    watch(
      filters,
      (value) => {
        const query = { ...currentRoute.query };
        for (const key of FILTER_QUERY_KEYS) delete query[key];
        Object.assign(query, queryFromFilters(value));
        // A filter change starts a new server page; a stale `page` would ask
        // for a page the filtered result may not have.
        delete query.page;

        const unchanged = FILTER_QUERY_KEYS.every(
          (key) =>
            String(currentRoute.query[key] ?? "") === String(query[key] ?? ""),
        );
        if (unchanged) return;

        void currentRouter.replace({ query });
      },
      { deep: true },
    );

    watch(
      () => currentRoute.query,
      () => {
        const next = filtersFromQuery();
        if (sameFilters(filters.value, next)) return;
        filters.value = next;
      },
      { deep: true },
    );
  }

  // With server filtering, the dropdown values come from the branch-wide
  // options (one page cannot enumerate them); otherwise they are derived from
  // the rows the table was handed.
  const viewports = computed(() =>
    filterOptions?.value
      ? filterOptions.value.viewports
      : [...new Set(tests.value.map((t) => t.viewport))].filter(
          (v): v is string => Boolean(v),
        ),
  );

  const browsers = computed(() =>
    filterOptions?.value
      ? filterOptions.value.browsers
      : [...new Set(tests.value.map((t) => t.browser))].filter(
          (b): b is string => Boolean(b),
        ),
  );

  const environments = computed(() =>
    filterOptions?.value
      ? filterOptions.value.environments
      : [...new Set(tests.value.map((t) => t.environment))].filter(
          (e): e is string => Boolean(e),
        ),
  );

  function matchesFilters(t: VisualTestItem) {
    const isPending = isPendingApproval(t.latestStatus);

    if (
      filters.value.search &&
      !(t.name ?? "").toLowerCase().includes(filters.value.search.toLowerCase())
    ) {
      return false;
    }

    if (
      filters.value.browser !== FILTER_ALL &&
      t.browser !== filters.value.browser
    )
      return false;

    if (
      filters.value.viewport !== FILTER_ALL &&
      t.viewport !== filters.value.viewport
    )
      return false;

    if (
      filters.value.environment !== FILTER_ALL &&
      t.environment !== filters.value.environment
    )
      return false;

    if (
      filters.value.kind !== FILTER_ALL &&
      (t.kind ?? IMAGE_TEST_KIND) !== filters.value.kind
    ) {
      return false;
    }

    if (filters.value.status === STATUS_FILTER_PENDING && !isPending)
      return false;
    if (filters.value.status === STATUS_FILTER_OK && isPending) return false;

    return true;
  }

  // Server-filtered rows are already the filtered set: re-filtering would apply
  // the current inputs a second time and hide rows whose server query matched
  // before a debounce caught up.
  const filteredTests = computed(() =>
    serverFiltered ? tests.value : tests.value.filter(matchesFilters),
  );

  const groups = computed<TestGroup[]>(() =>
    [...groupRowsByTestName(filteredTests.value)].map(([name, items]) => {
      const counts = countStatuses(items, (i) => i.latestStatus);
      return {
        name,
        items: [...items].sort((a) =>
          isPendingApproval(a.latestStatus) ? -1 : 1,
        ),
        // Buckets are a derived list of badges, each pairing a STATUS.* value
        // with its count and icon — so the group header renders whatever the
        // status vocabulary says instead of re-encoding which status maps to
        // which badge. The bucket order is the single status priority the
        // test-status domain owns (aggregateVariantStatuses iterates the same
        // list), so the directory and the aggregate cannot disagree on which
        // status wins. Only genuinely clean (UNCHANGED) variants are "ok", and
        // a baseline-less (PENDING) variant gets its own "No baseline" badge
        // instead of being swept into the green check. The icon comes from the
        // same single statusConfig map the badge component renders.
        badges: TEST_STATUS_PRIORITY.map((status) => ({
          status,
          count: counts[status] ?? 0,
          icon: iconFor(status),
        })).filter((badge) => badge.count > 0),
      };
    }),
  );

  const defaultAccordionValues = computed(() =>
    groups.value.map((g) => g.name),
  );

  function resetFilters() {
    filters.value = emptyFilters();
  }

  return {
    filters,
    viewports,
    browsers,
    environments,
    filteredTests,
    groups,
    defaultAccordionValues,
    resetFilters,
  };
}
