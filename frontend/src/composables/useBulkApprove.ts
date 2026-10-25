import { translateMessage as tm } from "@/lib/i18n-messages";
import { unref } from "vue";
import type { BulkApproveResultDto } from "@sdk";
import { approvalsControllerApproveAllPending } from "@sdk";
import type { MaybeRef } from "@/composables/useDomainQuery";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { approvalQueryKeys } from "@/domains/approvals/query-keys";
import { pdfTestQueryKeys } from "@/domains/pdf-test/query-keys";
import {
  pendingTestQueryKeys,
  reviewInboxQueryKeys,
} from "@/domains/pending-tests/query-keys";
import { projectQueryKeys } from "@/domains/projects/query-keys";
import { visualTestQueryKeys } from "@/domains/visual-test/query-keys";
import { branchQueryKeys } from "@/domains/branches/query-keys";
import { pendingVotesOf } from "@/domains/approvals/approve-result";

function successMessage(result: BulkApproveResultDto): string {
  const pending = pendingVotesOf(result);
  if (pending) {
    return tm("approval.pendingToast", {
      votes: pending.votes,
      required: pending.required,
      count: Math.max(0, pending.required - pending.votes),
    });
  }
  if (result.pending.length > 0) {
    return tm("toast.bulkApprovePending", {
      approved: result.approved,
      count: result.pending.length,
      failed: result.failed.length,
    });
  }
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
    invalidate: (client) => {
      // The batch promotes baselines across variants, so every read that shows
      // a status, a baseline, a queue or a trail is stale afterwards.
      client.invalidateQueries({ queryKey: visualTestQueryKeys.all() });
      client.invalidateQueries({ queryKey: pdfTestQueryKeys.all() });
      client.invalidateQueries({ queryKey: projectQueryKeys.all() });
      client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
      client.invalidateQueries({ queryKey: pendingTestQueryKeys.all() });
      client.invalidateQueries({ queryKey: reviewInboxQueryKeys.all() });
      client.invalidateQueries({ queryKey: branchQueryKeys.all() });
      client.invalidateQueries({ queryKey: approvalQueryKeys.all() });
    },
  });
}
