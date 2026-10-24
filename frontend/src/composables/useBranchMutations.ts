import {
  branchesControllerRemove,
  branchesControllerUpdate,
  projectsControllerUpdateProject,
} from "@sdk";
import type { QueryClient } from "@tanstack/vue-query";
import { unref, type MaybeRef } from "vue";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { sdkErrorMessage } from "@/lib/sdk";
import { branchQueryKeys } from "@/domains/branches/query-keys";
import { projectQueryKeys } from "@/domains/projects/query-keys";
import { visualTestQueryKeys } from "@/domains/visual-test/query-keys";
import { pdfTestQueryKeys } from "@/domains/pdf-test/query-keys";
import { invalidateReviewInbox } from "@/lib/invalidation";

// The raw endpoint calls are kept separate from the mutations so callers (and
// tests) can exercise the SDK shape without mounting the composable. They return
// the SDK response untouched — useSdkMutation owns the single unwrap.
export async function archiveBranch(
  projectName: string,
  branch: string,
  isArchived: boolean,
) {
  return branchesControllerUpdate({
    path: { projectName },
    query: { branch },
    body: { isArchived },
  });
}

export async function deleteBranch(projectName: string, branch: string) {
  return branchesControllerRemove({
    path: { projectName },
    query: { branch },
  });
}

// "Set default" lives on the project resource, not on the branch resource: it
// swaps `Project.defaultBranchId`. Every other lifecycle change is a branch
// PATCH, which is why this one has its own endpoint shape.
export async function setDefaultBranch(projectName: string, branch: string) {
  return projectsControllerUpdateProject({
    path: { projectName },
    body: { defaultBranchName: branch },
  });
}

export async function retargetBranch(
  projectName: string,
  branch: string,
  targetBranch: string | null,
) {
  return branchesControllerUpdate({
    path: { projectName },
    query: { branch },
    body: { targetBranch },
  });
}

export interface ArchiveBranchVariables {
  branch: string;
  isArchived: boolean;
}

export interface RetargetBranchVariables {
  branch: string;
  targetBranch: string | null;
}

// The interesting branch failures are 409s with a message the reviewer can act
// on ("Branch target creates a cycle", "… is the target of … — retarget it
// first"). Keep the server text instead of a generic "Operation failed".
function branchErrorMessage(action: string) {
  return (error: unknown) => {
    const detail = sdkErrorMessage(error, "");
    return detail ? `${action}: ${detail}` : action;
  };
}

export function useBranchMutations(projectName: MaybeRef<string>) {
  // One invalidation rule for every lifecycle change: the branch list, all
  // branch-scoped project reads, the per-kind test details (their
  // inherited/owned baseline label is derived from the graph) and the inbox.
  const invalidate = (client: QueryClient) => {
    void client.invalidateQueries({ queryKey: branchQueryKeys.all() });
    void client.invalidateQueries({ queryKey: projectQueryKeys.all() });
    void client.invalidateQueries({ queryKey: visualTestQueryKeys.all() });
    void client.invalidateQueries({ queryKey: pdfTestQueryKeys.all() });
    // Archiving/deleting a branch changes which pending reviews exist.
    invalidateReviewInbox(client);
  };
  // Read the name at mutation time, not at setup time: the same view instance can
  // outlive a project-param change, and a captured name would mutate the
  // previous project's branch.
  const project = () => unref(projectName);

  const archive = useSdkMutation<unknown, ArchiveBranchVariables>({
    mutationFn: ({ branch, isArchived }) =>
      archiveBranch(project(), branch, isArchived),
    successMessage: "Branch updated",
    errorMessage: branchErrorMessage("Could not update the branch"),
    invalidate,
  });

  const remove = useSdkMutation<unknown, string>({
    mutationFn: (branch) => deleteBranch(project(), branch),
    successMessage: "Branch deleted",
    errorMessage: branchErrorMessage("Could not delete the branch"),
    invalidate,
  });

  const setDefault = useSdkMutation<unknown, string>({
    mutationFn: (branch) => setDefaultBranch(project(), branch),
    successMessage: "Default branch updated",
    errorMessage: branchErrorMessage("Could not set the default branch"),
    invalidate,
  });

  const setTarget = useSdkMutation<unknown, RetargetBranchVariables>({
    mutationFn: ({ branch, targetBranch }) =>
      retargetBranch(project(), branch, targetBranch),
    successMessage: "Branch target updated",
    errorMessage: branchErrorMessage("Could not change the branch target"),
    invalidate,
  });

  return { archive, remove, setDefault, setTarget };
}
