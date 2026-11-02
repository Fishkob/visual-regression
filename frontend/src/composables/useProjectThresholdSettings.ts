import { unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { projectsControllerUpdatePixelThreshold } from "@sdk";
import { translateMessage as tm } from "@/lib/i18n-messages";
import { useSdkMutation } from "@/composables/useSdkMutation";
import type { MaybeRef } from "@/composables/useDomainQuery";
import { projectQueryKeys } from "@/domains/projects/query-keys";
import { invalidateProjectDetail } from "@/lib/invalidation";

// The default threshold is a project write read by the worker at comparison
// time. Refresh the detail read (which carries the value) and the project list,
// whose rows do not show it but share the project cache.
function invalidate(client: QueryClient, projectName: string) {
  invalidateProjectDetail(client, projectName);
  client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
}

// `null` removes the project default; a number sets it. The endpoint is
// ADMIN-only and audited old→new, like the review policy.
export function useUpdateProjectThreshold(projectName: MaybeRef<string>) {
  return useSdkMutation<{ pixelDiffThreshold: number | null }, number | null>({
    mutationFn: (pixelDiffThreshold) =>
      projectsControllerUpdatePixelThreshold({
        path: { projectName: unref(projectName) },
        body: { pixelDiffThreshold },
      }),
    successMessage: tm("thresholdSettings.saved"),
    errorMessage: tm("thresholdSettings.saveError"),
    invalidate: (client) => invalidate(client, unref(projectName)),
  });
}
