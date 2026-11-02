import { computed } from "vue";
import { useRoute } from "vue-router";
import type { VariantParams } from "@/lib/variant-key";
import { isTestKind } from "@/domains/test-kind";
import type { PendingTestFilters } from "@/domains/pending-tests/query-keys";

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function useRouteParams() {
  const route = useRoute();

  const projectName = computed(() => route.params.projectName as string);
  const testName = computed(() => route.params.testName as string);
  const runKey = computed(() => route.params.runKey as string);
  const viewport = computed(() => queryString(route.query.viewport));
  const browser = computed(() => queryString(route.query.browser));
  const environment = computed(() => queryString(route.query.environment));
  const branch = computed(() => queryString(route.query.branch));
  const fromInbox = computed(() => route.query.from === "inbox");
  // "My reviews" is review scope, not a local preference: the inbox stores it in
  // the URL, and a pass started from the filtered queue keeps walking the same
  // assigned set.
  const assignedToMe = computed(() => route.query.assignedToMe === "1");

  // The inbox filters that narrow the pass *within* the project. The inbox
  // carries them as `inbox*` keys on the detail route so the loop and its
  // "back to inbox" leg can restore them without colliding with the detail
  // route's own parameters.
  const inboxFilters = computed<PendingTestFilters>(() => {
    const kind = queryString(route.query.inboxKind);
    const q = queryString(route.query.inboxQ);
    const runKey = queryString(route.query.inboxRunKey);
    const tag = queryString(route.query.inboxTag);
    return {
      ...(kind && isTestKind(kind) ? { kind } : {}),
      ...(q ? { q } : {}),
      ...(runKey ? { runKey } : {}),
      ...(tag ? { tag } : {}),
    };
  });

  const filters = computed<VariantParams>(() => ({
    viewport: viewport.value,
    browser: browser.value,
    environment: environment.value,
  }));

  return {
    projectName,
    testName,
    runKey,
    filters,
    branch,
    fromInbox,
    assignedToMe,
    inboxFilters,
  };
}
