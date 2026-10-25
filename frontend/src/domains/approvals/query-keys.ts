export const approvalQueryKeys = {
  all: () => ["approvals"] as const,
  // The branch is appended only when one is selected, so the unfiltered
  // (project-default) read keeps its key while a branch-scoped read gets its
  // own cache entry — and all() stays a prefix that invalidates both.
  forTest: (args: { projectName: string; testName: string; branch?: string }) =>
    [
      ...approvalQueryKeys.all(),
      "list",
      args.projectName,
      args.testName,
      ...(args.branch ? [args.branch] : []),
    ] as const,
} as const;
