import type { QueryClient } from "@tanstack/vue-query";
import { translateMessage as tm } from "@/lib/i18n-messages";
import {
  projectTeamControllerAssign,
  teamsControllerCreate,
  teamsControllerList,
  teamsControllerRemove,
  teamsControllerRename,
  teamsControllerReplaceMembers,
  type ProjectTeamDto,
  type TeamDto,
} from "@sdk";
import { teamQueryKeys } from "@/domains/teams/query-keys";
import { mapTeams } from "@/domains/teams/team.mapper";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { useSdkMutation } from "@/composables/useSdkMutation";

// The read-only surface the project settings page shares with team
// administration: which teams exist, and which projects they own, is what
// answers "who owns this project". Admin-only in the API, so `enabled` is how the
// inbox's team lens asks for it only when the caller is an admin — everyone else
// uses the teams `/auth/me` already returned.
export function useTeamsQuery(enabled: MaybeRef<boolean> = true) {
  return useSdkQuery({
    args: {},
    required: [],
    keyOf: () => teamQueryKeys.list(),
    sdkFn: () => teamsControllerList(),
    map: (data: TeamDto[] | undefined) => mapTeams(data),
    enabled,
  });
}

// Every team write moves a row of the same list (and the settings page's
// assignment dropdown reads that list), so one prefix covers them all.
const invalidateTeams = (client: QueryClient) => {
  client.invalidateQueries({ queryKey: teamQueryKeys.all() });
};

export interface AssignProjectTeamVariables {
  projectName: string;
  teamId: string | null;
}

// `teamId: null` is a real write — it makes the project shared, which widens who
// can see it — so it gets its own toast instead of reading like a failed save.
export function useAssignProjectTeam() {
  return useSdkMutation<ProjectTeamDto, AssignProjectTeamVariables>({
    mutationFn: ({ projectName, teamId }) =>
      projectTeamControllerAssign({
        path: { projectName },
        body: { teamId },
      }),
    successMessage: (_data, { teamId }) =>
      teamId ? tm("toast.teamAssigned") : tm("toast.teamUnassigned"),
    errorMessage: tm("toast.teamAssignError"),
    invalidate: invalidateTeams,
  });
}

export function useCreateTeam() {
  return useSdkMutation<TeamDto, { name: string }>({
    mutationFn: (body) => teamsControllerCreate({ body }),
    successMessage: tm("toast.teamCreated"),
    errorMessage: tm("toast.teamCreateError"),
    invalidate: invalidateTeams,
  });
}

export interface RenameTeamVariables {
  id: string;
  name: string;
}

export function useRenameTeam() {
  return useSdkMutation<TeamDto, RenameTeamVariables>({
    mutationFn: ({ id, name }) =>
      teamsControllerRename({ path: { id }, body: { name } }),
    successMessage: tm("toast.teamRenamed"),
    errorMessage: tm("toast.teamRenameError"),
    invalidate: invalidateTeams,
  });
}

// A team that still owns projects is refused with 409; the mutation surfaces
// that answer instead of swallowing it (the view shows its message).
export function useDeleteTeam() {
  return useSdkMutation<{ success: boolean }, string>({
    mutationFn: (id) => teamsControllerRemove({ path: { id } }),
    successMessage: tm("toast.teamDeleted"),
    errorMessage: tm("toast.teamDeleteError"),
    invalidate: invalidateTeams,
  });
}

export interface ReplaceTeamMembersVariables {
  id: string;
  userIds: string[];
}

// The complete member set, not a delta: the dialog sends the checkboxes as they
// stand, so removing a member is the same write as adding one.
export function useReplaceTeamMembers() {
  return useSdkMutation<TeamDto, ReplaceTeamMembersVariables>({
    mutationFn: ({ id, userIds }) =>
      teamsControllerReplaceMembers({ path: { id }, body: { userIds } }),
    successMessage: tm("toast.teamMembersSaved"),
    errorMessage: tm("toast.teamMembersError"),
    invalidate: invalidateTeams,
  });
}
