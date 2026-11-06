import { translateMessage as tm } from "@/lib/i18n-messages";
import {
  branchesControllerRemove,
  branchesControllerUpdate,
  projectsControllerUpdateProject,
} from "@sdk";
import { useQueryClient, type QueryClient } from "@tanstack/vue-query";
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

// The post-merge cleanup in one action (docs/branches.md): stop uploads first,
// then remove the branch. Sequential rather than atomic on purpose — the archive
// is the half that keeps late uploads of a merged branch out, so it runs first
// and survives a refused delete; the failure then says which half landed instead
// of claiming nothing happened.
export async function archiveAndDeleteBranch(
  projectName: string,
  branch: string,
) {
  await archiveBranch(projectName, branch, true);
  try {
    return await deleteBranch(projectName, branch);
  } catch (error) {
    const detail = sdkErrorMessage(error, "");
    const base = tm("toast.branchArchiveAndDeletePartial");
    throw new Error(detail ? `${base}: ${detail}` : base);
  }
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
function branchErrorMessage(key: string) {
  return (error: unknown) => {
    const detail = sdkErrorMessage(error, "");
    const base = tm(key);
    return detail ? `${base}: ${detail}` : base;
  };
}

export function useBranchMutations(projectName: MaybeRef<string>) {
  const queryClient = useQueryClient();
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
    successMessage: tm("toast.branchUpdated"),
    errorMessage: branchErrorMessage("toast.branchUpdateError"),
    invalidate,
  });

  const remove = useSdkMutation<unknown, string>({
    mutationFn: (branch) => deleteBranch(project(), branch),
    successMessage: tm("toast.branchDeleted"),
    errorMessage: branchErrorMessage("toast.branchDeleteError"),
    invalidate,
  });

  // Archive-then-delete. A refused delete leaves the branch archived on the
  // server, so the lists are invalidated on the error path too — otherwise the
  // switcher keeps showing the pre-archive state and the next click repeats a
  // step that already happened.
  const retire = useSdkMutation<unknown, string>({
    mutationFn: (branch) => archiveAndDeleteBranch(project(), branch),
    successMessage: tm("toast.branchRetired"),
    // The composed call already carries the "archived, but not deleted" wording
    // for a partial failure; prefixing it again would read like a second error.
    errorMessage: (error) =>
      sdkErrorMessage(error, tm("toast.branchRetireError")),
    invalidate,
    onError: () => {
      invalidate(queryClient);
    },
  });

  const setDefault = useSdkMutation<unknown, string>({
    mutationFn: (branch) => setDefaultBranch(project(), branch),
    successMessage: tm("toast.defaultBranchUpdated"),
    errorMessage: branchErrorMessage("toast.defaultBranchError"),
    invalidate,
  });

  const setTarget = useSdkMutation<unknown, RetargetBranchVariables>({
    mutationFn: ({ branch, targetBranch }) =>
      retargetBranch(project(), branch, targetBranch),
    successMessage: tm("toast.branchTargetUpdated"),
    errorMessage: branchErrorMessage("toast.branchTargetError"),
    invalidate,
  });

  return { archive, remove, retire, setDefault, setTarget };
}
