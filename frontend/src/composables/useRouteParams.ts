import { computed } from "vue";
import { useRoute } from "vue-router";
import type { VariantParams } from "@/lib/variant-key";

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
  };
}
