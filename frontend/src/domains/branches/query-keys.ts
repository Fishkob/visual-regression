export const branchQueryKeys = {
  all: () => ["branches"] as const,
  list: (projectName: string, includeArchived: boolean) =>
    [...branchQueryKeys.all(), projectName, includeArchived] as const,
} as const;
