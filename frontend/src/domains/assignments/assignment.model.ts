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

// The default branch is represented by an absent branch in routes, by null in
// older assignments and by its resolved name ("main") in current ones. The
// project's default branch name closes that gap: an unscoped route means "the
// default branch", so an assignment that names it must still match.
export function matchesAssignmentScope(
  assignment: Assignment,
  scope: {
    projectName: string;
    testName: string;
    branch?: string;
    defaultBranchName?: string;
  },
): boolean {
  const assignmentBranch =
    assignment.branchName ?? scope.defaultBranchName ?? undefined;
  const scopeBranch = scope.branch ?? scope.defaultBranchName ?? undefined;
  return (
    assignment.projectName === scope.projectName &&
    assignment.testName === scope.testName &&
    assignmentBranch === scopeBranch
  );
}
