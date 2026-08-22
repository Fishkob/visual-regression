export const pendingTestQueryKeys = {
  all: () => ["pending-tests"] as const,
  lists: () => [...pendingTestQueryKeys.all(), "list"] as const,
  list: (projectName: string) =>
    [...pendingTestQueryKeys.lists(), projectName] as const,
} as const;
