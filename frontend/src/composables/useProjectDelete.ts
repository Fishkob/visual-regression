import { computed } from "vue";
import { projectsControllerDeleteProject } from "@sdk";
import type { Project } from "@/domains/projects/project.model";
import {
  invalidateProjectList,
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

    successMessage: (projectName) => `Deleted project "${projectName}"`,

    errorMessage: "Could not delete project",

    invalidate: (client, projectName) => {
      invalidateProjectList(client);
      invalidateProjectDetail(client, projectName);
    },
  });

  const deleteDescription = computed(() =>
    pendingProject.value?.name
      ? `Are you sure you want to delete "${pendingProject.value.name}"? This action cannot be undone.`
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
