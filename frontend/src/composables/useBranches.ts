import { branchesControllerList, type BranchSummaryDto } from "@sdk";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { branchQueryKeys } from "@/domains/branches/query-keys";
import { mapBranches } from "@/domains/branches/branch.mapper";

export function useBranchesQuery(
  projectName: MaybeRef<string | undefined>,
  includeArchived = false,
) {
  return useSdkQuery({
    args: { projectName },
    required: ["projectName"],
    keyOf: ({ projectName }) =>
      branchQueryKeys.list(projectName, includeArchived),
    sdkFn: ({ projectName }) =>
      branchesControllerList({
        path: { projectName },
        query: { includeArchived },
      }),
    map: (data: BranchSummaryDto[] | undefined) => mapBranches(data),
  });
}
