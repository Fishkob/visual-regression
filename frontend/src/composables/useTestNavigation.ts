import { useRouter } from "vue-router";
import type { Ref } from "vue";
import type { VariantParams } from "@/lib/variant-key";
import { REVIEW_LOOP_NAV_STATE } from "@/lib/review-pass";

export interface TestNavigationOptions {
  projectName: Ref<string>;
  branchName?: Ref<string | undefined>;
}

// One navigator behind two call sites. The review loop passes `fromLoop: true`
// so the destination reads "continued a pass" (keep skip-memory, lib/review-pass);
// every other entry (table click, deep link) leaves it off and starts a fresh
// pass. The loop-mark rides the route entry itself — see lib/review-pass for
// what that means for refresh and back-navigation. The branch rides the query so
// the destination detail page reviews the same branch the entry came from; an
// absent branch means the project default.
export function useTestNavigation(options: TestNavigationOptions) {
  const router = useRouter();
  const { projectName, branchName } = options;
  const branchQuery = () =>
    branchName?.value ? { branch: branchName.value } : {};

  function navigateToProjectDone() {
    router.push({
      name: "approval-done",
      params: { projectName: projectName.value },
      // The pass was branch-scoped, so completion is too — without this the done
      // page claims the whole project is reviewed and loses the branch context.
      ...(branchName?.value ? { query: branchQuery() } : {}),
    });
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
        ...branchQuery(),
      },
      ...(opts.fromLoop ? { state: REVIEW_LOOP_NAV_STATE } : {}),
    });
  }

  function navigateToNextTest(t: { name?: string } & VariantParams) {
    navigateToTest(t, { fromLoop: true });
  }

  // The browse entry: the overview shows every variant of the test at once and
  // is not part of the review pass, so it carries no loop mark.
  function navigateToTestOverview(t: { name?: string }) {
    if (!t.name) return;
    router.push({
      name: "test-overview",
      params: { projectName: projectName.value, testName: t.name },
      ...(branchName?.value ? { query: branchQuery() } : {}),
    });
  }

  function navigateToInbox() {
    router.push({
      name: "review-inbox",
      // "Back" is part of the pass: the inbox filter is URL-bound, so dropping
      // the branch would silently widen the queue to every branch after an
      // approve/skip that started from a branch-scoped inbox.
      ...(branchName?.value ? { query: branchQuery() } : {}),
    });
  }

  return {
    navigateToProjectDone,
    navigateToTest,
    navigateToNextTest,
    navigateToTestOverview,
    navigateToInbox,
  };
}
