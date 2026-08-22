import { ref, computed, type Ref } from "vue";
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

// The visual-tests table's derived state has one owner: the filter vocabulary,
// the filter state, and the grouping all live here, so the derive→filter→group
// pipeline stops being threaded across modules. The group shape lives in the
// projects domain (test-group.ts) — TestAccordionGroups renders those same
// values rather than re-declaring silently-driftable twins.

export interface VisualTestsTableOptions {
  tests: Ref<VisualTestItem[]>;
}

export function useVisualTestsTable(options: VisualTestsTableOptions) {
  const { tests } = options;

  const filters = ref<VisualTestFilters>({
    search: "",
    browser: FILTER_ALL,
    viewport: FILTER_ALL,
    status: FILTER_ALL,
    environment: FILTER_ALL,
  });

  const viewports = computed(() =>
    [...new Set(tests.value.map((t) => t.viewport))].filter((v): v is string =>
      Boolean(v),
    ),
  );

  const browsers = computed(() =>
    [...new Set(tests.value.map((t) => t.browser))].filter((b): b is string =>
      Boolean(b),
    ),
  );

  const environments = computed(() =>
    [...new Set(tests.value.map((t) => t.environment))].filter(
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

    if (filters.value.status === STATUS_FILTER_PENDING && !isPending)
      return false;
    if (filters.value.status === STATUS_FILTER_OK && isPending) return false;

    return true;
  }

  const filteredTests = computed(() => tests.value.filter(matchesFilters));

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
    filters.value = {
      search: "",
      browser: FILTER_ALL,
      viewport: FILTER_ALL,
      status: FILTER_ALL,
      environment: FILTER_ALL,
    };
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
