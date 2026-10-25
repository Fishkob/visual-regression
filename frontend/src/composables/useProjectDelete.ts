import { translateMessage as tm } from "@/lib/i18n-messages";
import { computed } from "vue";
import { projectsControllerDeleteProject } from "@sdk";
import type { Project } from "@/domains/projects/project.model";
import {
  invalidateProjectsForGroupChange,
  invalidateProjectDetail,
} from "@/lib/invalidation";
import { useEntityDeleteMutation } from "@/composables/useEntityDeleteMutation";

export function useProjectDelete() {
  const {
    pendingEntity: pendingProject,
    showConfirm,
    deleting,
    requestDelete,
    confirmDelete,
    cancelDelete,
  } = useEntityDeleteMutation<Project, string>({
    mutationFn: (projectName) =>
      projectsControllerDeleteProject({
        path: { projectName },
      }),

    argsOf: (project) => project.name ?? null,

    successMessage: (projectName) =>
      tm("toast.projectDeleted", { name: projectName }),

    errorMessage: tm("toast.projectDeleteError"),

    invalidate: (client, projectName) => {
      invalidateProjectsForGroupChange(client);
      invalidateProjectDetail(client, projectName);
    },
  });

  const deleteDescription = computed(() =>
    pendingProject.value?.name
      ? tm("confirm.deleteProject", { name: pendingProject.value.name })
      : "",
  );

  return {
    showConfirm,
    deleting,
    deleteDescription,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
}
