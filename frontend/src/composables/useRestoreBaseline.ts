import { translateMessage as tm } from "@/lib/i18n-messages";
import { unref } from "vue";
import {
  baselineHistoryControllerRestore,
  type RestoreBaselineResultDto,
} from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import type { MaybeRef } from "@/composables/useDomainQuery";
import { invalidateAfterBaselineRestore } from "@/lib/invalidation";
import { formatVariantLabel } from "@/lib/format-variant-label";
import type { VariantParams } from "@/lib/variant-key";

export interface RestoreBaselineArgs {
  projectName: string;
  testName: string;
  revisionId: string;
  branch?: string;
  viewport?: string;
  browser?: string;
  environment?: string;
}

// Restore is a state change, not a re-read: it rewrites the baseline row,
// retires the pending comparisons of the variant and recomputes the test
// status. The mutation therefore invalidates the details (and everything the
// details invalidation already fans out to) plus the history that just gained
// the replaced baseline as a new revision.
export function useRestoreBaseline(options: {
  projectName: MaybeRef<string>;
  testName: MaybeRef<string>;
  branchName?: MaybeRef<string | undefined>;
  variant: MaybeRef<VariantParams>;
}) {
  const { projectName, testName, branchName, variant } = options;

  // One builder for the endpoint args, shared by the call and the invalidation,
  // so a field added here cannot land in one and miss the other.
  function buildArgs(revisionId: string): RestoreBaselineArgs {
    const branch = branchName ? unref(branchName) : undefined;
    const v = unref(variant);
    return {
      projectName: unref(projectName),
      testName: unref(testName),
      revisionId,
      ...(branch ? { branch } : {}),
      viewport: v.viewport,
      browser: v.browser,
      environment: v.environment,
    };
  }

  const { mutate, isPending } = useSdkMutation<
    RestoreBaselineResultDto,
    RestoreBaselineArgs
  >({
    mutationFn: (args) =>
      baselineHistoryControllerRestore({
        path: { projectName: args.projectName, testName: args.testName },
        body: { revisionId: args.revisionId },
        ...(args.branch ? { query: { branch: args.branch } } : {}),
      }),

    successMessage: (_, { testName: tn, viewport, browser, environment }) => {
      const variantInfo =
        formatVariantLabel({ viewport, browser, environment }) ||
        tm("toast.entireTest");
      return tm("toast.baselineRestored", { variant: variantInfo, test: tn });
    },

    errorMessage: tm("toast.baselineRestoreError"),

    invalidate: (
      client,
      _,
      { projectName: pn, testName: tn, branch, viewport, browser, environment },
    ) =>
      invalidateAfterBaselineRestore(client, {
        projectName: pn,
        testName: tn,
        ...(branch ? { branch } : {}),
        viewport,
        browser,
        environment,
      }),
  });

  return {
    restore: (revisionId: string) => mutate(buildArgs(revisionId)),
    isPending,
  };
}
