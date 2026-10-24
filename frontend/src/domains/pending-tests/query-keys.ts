export const reviewInboxQueryKeys = {
  all: () => ["review-inbox"] as const,
  list: () => [...reviewInboxQueryKeys.all(), "list"] as const,
  count: () => [...reviewInboxQueryKeys.all(), "count"] as const,
} as const;

export const pendingTestQueryKeys = {
  all: () => ["pending-tests"] as const,
  lists: () => [...pendingTestQueryKeys.all(), "list"] as const,
  // The branch part is appended only when one is selected, so the
  // project-default read keeps its stable key while a branch-scoped read gets
  // its own cache entry (and lists() prefix-matches both).
  list: (projectName: string, branchName?: string) =>
    [
      ...pendingTestQueryKeys.lists(),
      projectName,
      ...(branchName ? [branchName] : []),
    ] as const,
} as const;
