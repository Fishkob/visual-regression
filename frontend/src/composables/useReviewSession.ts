import { watch, type Ref } from "vue";
import { useQueryClient, type QueryClient } from "@tanstack/vue-query";
import type { ApproveResultDto } from "@sdk";
import { keyOf } from "@/lib/variant-key";
import type { VariantParams } from "@/lib/variant-key";
import { formatVariantLabel } from "@/lib/format-variant-label";
import {
  isSeen,
  markSeen,
  resetReviewSeen,
  beginPassForProject,
} from "@/lib/review-pass";
import { useTestNavigation } from "@/composables/useTestNavigation";
import type { PendingTest } from "@/domains/pending-tests/pending-test";
import {
  optimisticallyRemovePendingTest,
  restorePendingTestCache,
} from "@/composables/usePendingTests";
import { useSdkMutation } from "@/composables/useSdkMutation";

// The skip-memory + fresh/continued-pass rule lives in lib/review-pass — see
// CONTEXT.md for the pass semantics.

interface ReviewSessionContext {
  previous: PendingTest[] | undefined;
  keys: readonly string[];
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
  invalidateDetails: (
    client: QueryClient,
    args: { projectName: string; testName: string } & VariantParams,
  ) => void;
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
  // this project: a deep link or refresh must not inherit skip-marks from an
  // earlier session. The rule lives in lib/review-pass — beginPassForProject
  // reads the history.state mark the loop writes on its navigations.
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
      const currentKey = buildCurrentKey();
      // The pending-list cache write is owned by the pending-tests seam —
      // cancel + snapshot + optimistic remove all live beside the query.
      const { previous, keys } = await optimisticallyRemovePendingTest(
        queryClient,
        projectName.value,
        currentKey,
      );
      return {
        previous,
        keys,
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
      if (context?.previous && context?.keys) {
        restorePendingTestCache(queryClient, context.keys, context.previous);
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
