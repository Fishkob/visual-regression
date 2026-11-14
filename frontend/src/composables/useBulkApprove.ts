import { translateMessage as tm } from "@/lib/i18n-messages";
import { unref } from "vue";
import type { BulkApproveResultDto } from "@sdk";
import { approvalsControllerApproveAllPending } from "@sdk";
import type { MaybeRef } from "@/composables/useDomainQuery";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { invalidateAfterBulkApprove } from "@/lib/invalidation";

function successMessage(result: BulkApproveResultDto): string {
  const failed = result.failed.length
    ? tm("toast.failedParenthetical", { count: result.failed.length })
    : "";
  if (result.approved === 0 && result.failed.length === 0) {
    return tm("toast.noPendingVariants");
  }
  return `${tm("toast.approvedVariants", { count: result.approved })}${failed}`;
}

export function useBulkApprove(
  projectName: MaybeRef<string>,
  testName: MaybeRef<string>,
  branchName?: MaybeRef<string | undefined>,
) {
  return useSdkMutation<BulkApproveResultDto, void>({
    mutationFn: () => {
      const branch = unref(branchName);
      return approvalsControllerApproveAllPending({
        path: {
          projectName: unref(projectName),
          testName: unref(testName),
        },
        ...(branch ? { query: { branch } } : {}),
      });
    },
    successMessage,
    errorMessage: tm("toast.bulkApproveFailed"),
    // The payload is the same read fan-out as the inbox's bulk approval, so the
    // two paths share one list instead of restating it: the copy that lived here
    // had already drifted and missed the run the batch belongs to, which left
    // the runs list showing the pre-approval status counts.
    invalidate: (client) => invalidateAfterBulkApprove(client),
  });
}
