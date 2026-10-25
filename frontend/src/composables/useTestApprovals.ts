import { approvalsControllerListApprovals } from "@sdk";
import { mapApprovals } from "@/domains/approvals/approval.mapper";
import { approvalQueryKeys } from "@/domains/approvals/query-keys";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";

// The durable approval trail of one test: the newest 20 approvals, newest
// first. Read-only by design — the badge that renders it must never disturb the
// review header, so there is no retry/polling policy beyond the client default.
export function useTestApprovalsQuery(
  projectName: MaybeRef<string | undefined>,
  testName: MaybeRef<string | undefined>,
  branchName?: MaybeRef<string | undefined>,
) {
  return useSdkQuery({
    args: { projectName, testName, branchName },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, branchName }) =>
      approvalQueryKeys.forTest({ projectName, testName, branch: branchName }),
    sdkFn: ({ projectName, testName, branchName }) =>
      approvalsControllerListApprovals({
        path: { projectName, testName },
        ...(branchName ? { query: { branch: branchName } } : {}),
      }),
    map: mapApprovals,
  });
}
