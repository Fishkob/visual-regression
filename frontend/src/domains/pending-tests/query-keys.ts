export const reviewInboxQueryKeys = {
  all: () => ["review-inbox"] as const,
  list: () => [...reviewInboxQueryKeys.all(), "list"] as const,
  count: () => [...reviewInboxQueryKeys.all(), "count"] as const,
} as const;

export const pendingTestQueryKeys = {
  all: () => ["pending-tests"] as const,
  lists: () => [...pendingTestQueryKeys.all(), "list"] as const,
  list: (projectName: string) =>
    [...pendingTestQueryKeys.lists(), projectName] as const,
} as const;
