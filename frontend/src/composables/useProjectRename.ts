import { unref } from "vue";
import { translateMessage as tm } from "@/lib/i18n-messages";
import { projectsControllerUpdateProject, type ProjectDto } from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import type { MaybeRef } from "@/composables/useDomainQuery";
import { invalidateAfterProjectRename } from "@/lib/invalidation";

// The rename answers with the renamed project, which is what the caller needs:
// the name is the route param afterwards, so the form navigates with the
// response instead of the string it typed (the server trims and owns the rule).
export function useRenameProject(projectName: MaybeRef<string>) {
  return useSdkMutation<ProjectDto, string>({
    mutationFn: (name) =>
      projectsControllerUpdateProject({
        path: { projectName: unref(projectName) },
        body: { name },
      }),
    successMessage: tm("renameProject.saved"),
    errorMessage: tm("renameProject.saveError"),
    invalidate: (client) => invalidateAfterProjectRename(client),
  });
}
