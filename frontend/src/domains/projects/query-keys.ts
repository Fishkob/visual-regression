export const projectQueryKeys = {
  all: () => ["projects"] as const,
  withPending: () => [...projectQueryKeys.all(), "pending"] as const,
  // The branch is appended only when one is selected, so `detail(projectName)`
  // stays a prefix that invalidates every branch variant of that project.
  detail: (projectName: string, branchName?: string) =>
    [
      ...projectQueryKeys.all(),
      "detail",
      projectName,
      ...(branchName ? [branchName] : []),
    ] as const,
} as const;
