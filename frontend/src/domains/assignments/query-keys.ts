export const assignmentQueryKeys = {
  all: () => ["assignments"] as const,
  mine: () => [...assignmentQueryKeys.all(), "mine"] as const,
  overdue: () => [...assignmentQueryKeys.all(), "overdue"] as const,
} as const;
