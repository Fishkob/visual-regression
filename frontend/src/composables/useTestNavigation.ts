import { useRouter } from "vue-router";
import type { Ref } from "vue";
import type { VariantParams } from "@/lib/variant-key";
import { REVIEW_LOOP_NAV_STATE } from "@/lib/review-pass";

export interface TestNavigationOptions {
  projectName: Ref<string>;
}

// One navigator behind two call sites. The review loop passes `fromLoop: true`
// so the destination reads "continued a pass" (keep skip-memory, lib/review-pass);
// every other entry (table click, deep link) leaves it off and starts a fresh
// pass. The loop-mark rides the route entry itself, so a later direct entry
// (deep link, refresh, back-navigation) never inherits it.
export function useTestNavigation(options: TestNavigationOptions) {
  const router = useRouter();
  const { projectName } = options;

  function navigateToProjectDone() {
    router.push(`/projects/${projectName.value}/done`);
  }

  function navigateToTest(
    t: { name?: string } & VariantParams,
    opts: { fromLoop?: boolean } = {},
  ) {
    if (!t.name) return;
    router.push({
      name: "test-detail",
      params: { projectName: projectName.value, testName: t.name },
      query: {
        viewport: t.viewport,
        browser: t.browser,
        environment: t.environment,
      },
      ...(opts.fromLoop ? { state: REVIEW_LOOP_NAV_STATE } : {}),
    });
  }

  function navigateToNextTest(t: { name?: string } & VariantParams) {
    navigateToTest(t, { fromLoop: true });
  }

  return {
    navigateToProjectDone,
    navigateToTest,
    navigateToNextTest,
  };
}
