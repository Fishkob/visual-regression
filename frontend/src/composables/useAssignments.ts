import { unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import {
  assignmentControllerComplete,
  assignmentControllerCreate,
  assignmentControllerMine,
  assignmentControllerOverdue,
  type AssignmentDto,
} from "@sdk";
import { translateMessage as tm } from "@/lib/i18n-messages";
import { unwrapSdkData } from "@/lib/sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useDomainQuery, type MaybeRef } from "@/composables/useDomainQuery";
import {
  mapAssignment,
  mapAssignments,
} from "@/domains/assignments/assignment.mapper";
import type {
  Assignment,
  CreateAssignmentInput,
} from "@/domains/assignments/assignment.model";
import { assignmentQueryKeys } from "@/domains/assignments/query-keys";
import { reviewInboxQueryKeys } from "@/domains/pending-tests/query-keys";

// Assignments drive both the test-detail badge and the inbox "My reviews"
// filter, so a write must refresh the assignment lists and the inbox lists.
function invalidateAssignments(client: QueryClient) {
  client.invalidateQueries({ queryKey: assignmentQueryKeys.all() });
  client.invalidateQueries({ queryKey: reviewInboxQueryKeys.lists() });
}

export function useMyAssignmentsQuery() {
  return useDomainQuery<Assignment[]>({
    queryKey: assignmentQueryKeys.mine(),
    queryFn: async () => {
      const response = await assignmentControllerMine();
      return mapAssignments(unwrapSdkData<AssignmentDto[]>(response) ?? []);
    },
  });
}

export function useOverdueAssignmentsQuery() {
  return useDomainQuery<Assignment[]>({
    queryKey: assignmentQueryKeys.overdue(),
    queryFn: async () => {
      const response = await assignmentControllerOverdue();
      return mapAssignments(unwrapSdkData<AssignmentDto[]>(response) ?? []);
    },
  });
}

export function useCreateAssignment(projectName: MaybeRef<string>) {
  return useSdkMutation<AssignmentDto, CreateAssignmentInput>({
    mutationFn: (body) =>
      assignmentControllerCreate({
        path: { projectName: unref(projectName) },
        body,
      }),
    successMessage: tm("assignments.created"),
    errorMessage: tm("assignments.createError"),
    invalidate: (client) => invalidateAssignments(client),
  });
}

export function useCompleteAssignment() {
  return useSdkMutation<AssignmentDto, string>({
    mutationFn: (id) => assignmentControllerComplete({ path: { id } }),
    successMessage: tm("assignments.completed"),
    errorMessage: tm("assignments.completeError"),
    invalidate: (client) => invalidateAssignments(client),
  });
}

// One declaration for consumers that need several faces of the same domain;
// each inner hook still owns its own query/mutation.
export function useAssignments(projectName: MaybeRef<string>) {
  return {
    mine: useMyAssignmentsQuery(),
    overdue: useOverdueAssignmentsQuery(),
    create: useCreateAssignment(projectName),
    complete: useCompleteAssignment(),
  };
}

export function mapCreatedAssignment(
  dto: AssignmentDto | undefined,
): Assignment | undefined {
  return mapAssignment(dto);
}
