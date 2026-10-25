import type { TestKind } from "@/domains/test-kind";

export interface Assignment {
  id: string;
  projectName: string;
  branchName: string | null;
  testName: string | null;
  testKind?: TestKind;
  runKey: string | null;
  assigneeUsername: string;
  assignedBy: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  isOverdue: boolean;
}

export interface CreateAssignmentInput {
  testName?: string;
  branch?: string;
  runKey?: string;
  assignee: string;
  dueAt?: string | null;
}

export function isOpenAssignment(assignment: Assignment): boolean {
  return !assignment.completedAt;
}

// The default branch is represented by an absent branch in routes and by null
// in assignments, so both spellings compare equal here.
export function matchesAssignmentScope(
  assignment: Assignment,
  scope: { projectName: string; testName: string; branch?: string },
): boolean {
  return (
    assignment.projectName === scope.projectName &&
    assignment.testName === scope.testName &&
    (assignment.branchName ?? undefined) === (scope.branch ?? undefined)
  );
}
