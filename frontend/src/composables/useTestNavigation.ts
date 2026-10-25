import { useRoute, useRouter } from "vue-router";
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
// absent branch means the project default. The inbox's kind/group filters ride
// the query the same way (`inboxKind`/`inboxGroup`), so the whole pass keeps the
// scope it was started with.
export function useTestNavigation(options: TestNavigationOptions) {
  const router = useRouter();
  const route = useRoute();
  const { projectName, branchName } = options;
  const branchQuery = () =>
    branchName?.value ? { branch: branchName.value } : {};

  // Only strings are a usable scope: a repeated/array query parameter means the
  // URL was hand-written, not produced by the inbox filters. "My reviews" keeps
  // its own key on the detail route (it scopes the pending list), so the loop
  // and the way back carry it unchanged.
  function inboxScopeQuery() {
    const scope: Record<string, string> = {};
    const { inboxKind, inboxGroup, assignedToMe } = route.query;
    if (typeof inboxKind === "string" && inboxKind) {
      scope.inboxKind = inboxKind;
    }
    if (typeof inboxGroup === "string" && inboxGroup) {
      scope.inboxGroup = inboxGroup;
    }
    if (assignedToMe === "1") {
      scope.assignedToMe = "1";
    }
    return scope;
  }

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
        ...inboxScopeQuery(),
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
    // "Back" is part of the pass: the inbox filters are URL-bound, so dropping
    // any part of the scope would silently widen the queue after an approve/skip
    // that started from a filtered inbox. `inboxKind`/`inboxGroup` map back to
    // the inbox's own `kind`/`group` keys.
    const scope = inboxScopeQuery();
    const query: Record<string, string> = {
      ...(branchName?.value ? { branch: branchName.value } : {}),
      ...(scope.inboxKind ? { kind: scope.inboxKind } : {}),
      ...(scope.inboxGroup ? { group: scope.inboxGroup } : {}),
      ...(scope.assignedToMe ? { assignedToMe: scope.assignedToMe } : {}),
    };
    router.push({
      name: "review-inbox",
      ...(Object.keys(query).length ? { query } : {}),
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
