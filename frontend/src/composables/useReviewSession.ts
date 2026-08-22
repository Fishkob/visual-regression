import { watch, type Ref } from "vue";
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
} from "@/lib/review-pass";
import { useTestNavigation } from "@/composables/useTestNavigation";
import type { PendingTest } from "@/domains/pending-tests/pending-test";
import { withPendingTestRemoved } from "@/composables/usePendingTests";
import { useSdkMutation } from "@/composables/useSdkMutation";

// The skip-memory + fresh/continued-pass rule lives in lib/review-pass — see
// CONTEXT.md for the pass semantics.

interface ReviewSessionContext {
  restore: () => void;
  currentVariant: VariantParams;
  currentTestName: string;
}

export interface ReviewSessionOptions {
  projectName: Ref<string>;
  testName: Ref<string>;
  filters: Ref<VariantParams>;
  pendingTests: Ref<PendingTest[]>;
  currentComparisonId: Ref<string | undefined>;
  approve: (comparisonId: string) => Promise<unknown>;
  invalidateDetails: (client: QueryClient, args: TestDetailsArgs) => void;
}

export function useReviewSession(args: ReviewSessionOptions) {
  const {
    projectName,
    testName,
    filters,
    pendingTests,
    currentComparisonId,
    approve,
    invalidateDetails,
  } = args;
  const queryClient = useQueryClient();
  const navigation = useTestNavigation({ projectName });
  const buildCurrentKey = () =>
    keyOf({ name: testName.value, ...filters.value });

  // Entered directly (not via the loop's navigateToTest) means a fresh pass for
  // this project. The rule lives in lib/review-pass — beginPassForProject reads
  // the history.state mark the loop writes on its navigations. The mark rides
  // the route entry, so a back-navigation to a loop-marked test continues the
  // pass, while a table click or deep link starts fresh.
  beginPassForProject(projectName.value);
  watch(projectName, (name) => resetReviewSeen(name));

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
        buildCurrentKey(),
      );
      return {
        restore,
        currentVariant: { ...filters.value },
        currentTestName: testName.value,
      };
    },

    successMessage: (_data, _variables, context) =>
      `Approved ${formatVariantLabel(context?.currentVariant ?? filters.value) || "entire test"} of "${context?.currentTestName || testName.value}"`,

    errorMessage: (_error, _variables, context) =>
      `Could not approve ${formatVariantLabel(context?.currentVariant ?? filters.value) || "test"} of "${context?.currentTestName || testName.value}"`,

    invalidate: (client, _data, _variables, context) => {
      if (!context) return;
      invalidateDetails(client, {
        projectName: projectName.value,
        testName: context.currentTestName,
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
      navigateToNext();
    },

    onError: (_error, _variables, context) => {
      context?.restore?.();
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
    const currentKey = buildCurrentKey();

    markSeenKey(currentKey);
    navigateToNext();
  };

  return {
    handleApprove,
    handleSkip,
    isApproving: approveMutation.isPending,
  };
}
