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
  const viewport = computed(() => queryString(route.query.viewport));
  const browser = computed(() => queryString(route.query.browser));
  const environment = computed(() => queryString(route.query.environment));
  const branch = computed(() => queryString(route.query.branch));
  const fromInbox = computed(() => route.query.from === "inbox");

  const filters = computed<VariantParams>(() => ({
    viewport: viewport.value,
    browser: browser.value,
    environment: environment.value,
  }));

  return {
    projectName,
    testName,
    filters,
    branch,
    fromInbox,
  };
}
