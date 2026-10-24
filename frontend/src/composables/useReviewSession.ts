import { computed, unref, watch, type Ref } from "vue";
import { useQueryClient, type QueryClient } from "@tanstack/vue-query";
import type { ApproveResultDto } from "@sdk";
import {
  keyOf,
  type TestDetailsArgs,
  type VariantParams,
} from "@/lib/variant-key";
import { formatVariantLabel } from "@/lib/format-variant-label";
import {
  isSeen,
  markSeen,
  resetReviewSeen,
  beginPassForProject,
  beginPassProgress,
  setPassTotal,
  advancePassProgress,
  getPassProgress,
} from "@/lib/review-pass";
import { useTestNavigation } from "@/composables/useTestNavigation";
import type { PendingTest } from "@/domains/pending-tests/pending-test";
import { withPendingTestRemoved } from "@/composables/usePendingTests";
import { withReviewInboxItemRemoved } from "@/composables/useReviewInbox";
import { invalidateReviewInbox } from "@/lib/invalidation";
import { sdkErrorMessage } from "@/lib/sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";

// The skip-memory + fresh/continued-pass rule lives in lib/review-pass — see
// CONTEXT.md for the pass semantics.

interface ReviewSessionContext {
  restore: () => void;
  restoreInbox?: () => void;
  currentVariant: VariantParams;
  currentTestName: string;
  currentBranch?: string;
}

export interface ReviewSessionOptions {
  projectName: Ref<string>;
  testName: Ref<string>;
  branchName: Ref<string | undefined>;
  filters: Ref<VariantParams>;
  pendingTests: Ref<PendingTest[]>;
  currentComparisonId: Ref<string | undefined>;
  approve: (comparisonId: string) => Promise<unknown>;
  invalidateDetails: (client: QueryClient, args: TestDetailsArgs) => void;
  returnToInbox?: boolean | Ref<boolean>;
}

export function useReviewSession(args: ReviewSessionOptions) {
  const {
    projectName,
    testName,
    branchName,
    filters,
    pendingTests,
    currentComparisonId,
    approve,
    invalidateDetails,
    returnToInbox = false,
  } = args;
  const queryClient = useQueryClient();
  const navigation = useTestNavigation({ projectName, branchName });
  const shouldReturnToInbox = computed(() => unref(returnToInbox));
  const buildCurrentKey = () =>
    keyOf({ name: testName.value, ...filters.value });

  // Entered directly (not via the loop's navigateToTest) means a fresh pass for
  // this project. The rule lives in lib/review-pass — beginPassForProject reads
  // the history.state mark the loop writes on its navigations. The mark rides
  // the route entry, so a back-navigation to a loop-marked test continues the
  // pass, while a table click or deep link starts fresh.
  beginPassForProject(projectName.value);
  beginPassProgress(projectName.value, pendingTests.value.length);
  watch(projectName, (name) => {
    resetReviewSeen(name);
    beginPassProgress(name, pendingTests.value.length);
  });
  // A different branch is a different pending list: the skip-memory collected
  // on the previous branch must not suppress tests on the new one.
  watch(branchName, () => {
    resetReviewSeen(projectName.value);
    beginPassProgress(projectName.value, pendingTests.value.length);
  });

  watch(pendingTests, (list) => setPassTotal(projectName.value, list.length), {
    immediate: true,
  });

  const progress = computed(() => getPassProgress(projectName.value));

  const isSeenKey = (key: string) => isSeen(projectName.value, key);
  const markSeenKey = (key: string) => {
    markSeen(projectName.value, key);
  };
  const findNextUnseen = (pendingTests: PendingTest[]) =>
    pendingTests.find((t) => !isSeenKey(keyOf(t)));

  const approveMutation = useSdkMutation<
    ApproveResultDto,
    string,
    ReviewSessionContext
  >({
    // The mutation variable pins the exact comparison the reviewer saw. A
    // newer upload must never redirect the approval to content the reviewer
    // never reviewed.
    mutationFn: approve,

    onMutate: async () => {
      // The pending-list cache transaction is owned by the pending-tests seam:
      // this only declares the removal and keeps the restore closure for rollback.
      const { restore } = await withPendingTestRemoved(
        queryClient,
        projectName.value,
        branchName.value,
        buildCurrentKey(),
      );
      const inboxRemoval =
        shouldReturnToInbox.value && currentComparisonId.value
          ? await withReviewInboxItemRemoved(
              queryClient,
              currentComparisonId.value,
            )
          : null;
      return {
        restore,
        ...(inboxRemoval ? { restoreInbox: inboxRemoval.restore } : {}),
        currentVariant: { ...filters.value },
        currentTestName: testName.value,
        ...(branchName.value ? { currentBranch: branchName.value } : {}),
      };
    },

    successMessage: (_data, _variables, context) =>
      `Approved ${formatVariantLabel(context?.currentVariant ?? filters.value) || "entire test"} of "${context?.currentTestName || testName.value}"`,

    errorMessage: (error, _variables, context) => {
      const base = `Could not approve ${formatVariantLabel(context?.currentVariant ?? filters.value) || "test"} of "${context?.currentTestName || testName.value}"`;
      const detail = sdkErrorMessage(error, "");
      return detail && detail !== "Request failed"
        ? `${base}: ${detail}`
        : base;
    },

    invalidate: (client, _data, _variables, context) => {
      if (!context) return;
      invalidateDetails(client, {
        projectName: projectName.value,
        testName: context.currentTestName,
        ...(context.currentBranch ? { branch: context.currentBranch } : {}),
        ...context.currentVariant,
      });
    },

    // Navigation happens only AFTER the server confirms the approval, not in
    // onMutate: a failure (e.g. the CONFLICT on a stale comparison CONTEXT.md:48
    // documents) must leave the reviewer on the failed test, not strand them on
    // the next one. The optimistic cache removal still applies in onMutate so
    // the loop never re-offers the in-flight test, but moving is a success-only
    // side effect.
    onSuccess: () => {
      if (shouldReturnToInbox.value) {
        navigation.navigateToInbox();
        return;
      }
      advancePassProgress(projectName.value);
      navigateToNext();
    },

    onError: (_error, _variables, context) => {
      context?.restore?.();
      context?.restoreInbox?.();
      if (context) {
        invalidateDetails(queryClient, {
          projectName: projectName.value,
          testName: context.currentTestName,
          ...(context.currentBranch ? { branch: context.currentBranch } : {}),
          ...context.currentVariant,
        });
      }
    },
  });

  const navigateToNext = () => {
    const next = findNextUnseen(pendingTests.value);

    if (!next) {
      navigation.navigateToProjectDone();
      return;
    }

    navigation.navigateToNextTest(next);
  };

  const handleApprove = () => {
    const comparisonId = currentComparisonId.value;
    if (!comparisonId) return;
    approveMutation.mutate(comparisonId);
  };

  const handleSkip = () => {
    if (shouldReturnToInbox.value) {
      invalidateReviewInbox(queryClient);
      navigation.navigateToInbox();
      return;
    }

    markSeenKey(buildCurrentKey());
    advancePassProgress(projectName.value);
    navigateToNext();
  };

  return {
    handleApprove,
    handleSkip,
    isApproving: approveMutation.isPending,
    progress,
  };
}
