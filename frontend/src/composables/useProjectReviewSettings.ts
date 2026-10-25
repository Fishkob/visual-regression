import { unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { projectsControllerUpdateReviewPolicy } from "@sdk";
import { translateMessage as tm } from "@/lib/i18n-messages";
import { useSdkMutation } from "@/composables/useSdkMutation";
import type { MaybeRef } from "@/composables/useDomainQuery";
import { projectQueryKeys } from "@/domains/projects/query-keys";
import { invalidateProjectDetail } from "@/lib/invalidation";

// The review setting is a project write; refresh both the detail read (which
// carries requiredApprovals) and the list's pending flags.
function invalidate(client: QueryClient, projectName: string) {
  invalidateProjectDetail(client, projectName);
  client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
}

export function useUpdateProjectReviewSettings(projectName: MaybeRef<string>) {
  return useSdkMutation<{ requiredApprovals?: number }, number>({
    mutationFn: (requiredApprovals) =>
      projectsControllerUpdateReviewPolicy({
        path: { projectName: unref(projectName) },
        body: { requiredApprovals },
      }),
    successMessage: tm("reviewSettings.saved"),
    errorMessage: tm("reviewSettings.saveError"),
    invalidate: (client) => invalidate(client, unref(projectName)),
  });
}
