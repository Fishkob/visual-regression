import { computed } from "vue";
import { useRoute } from "vue-router";
import type { VariantParams } from "@/lib/variant-key";

export function useRouteParams() {
  const route = useRoute();

  const projectName = computed(() => route.params.projectName as string);
  const testName = computed(() => route.params.testName as string);
  const viewport = computed(() => route.query.viewport as string | undefined);
  const browser = computed(() => route.query.browser as string | undefined);
  const environment = computed(
    () => route.query.environment as string | undefined,
  );
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
    fromInbox,
  };
}
