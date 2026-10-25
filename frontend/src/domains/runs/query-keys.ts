import type { RunListQuery } from "./run.model";

// Runs are project-scoped and paged, and a run is only addressable with its
// branch (a run key is unique per branch). The key builders therefore carry the
// project, the run key and — when one is selected — the branch, so a filtered
// page or a branch-scoped detail gets its own cache entry while the shorter
// forms stay prefixes that invalidate every variant.
export const runsQueryKeys = {
  all: () => ["runs"] as const,
  lists: () => [...runsQueryKeys.all(), "list"] as const,
  // Omitting the query yields the project prefix, which invalidates every
  // branch/page entry of that project.
  list: (projectName: string, query?: RunListQuery) =>
    (query
      ? [...runsQueryKeys.lists(), projectName, query]
      : [...runsQueryKeys.lists(), projectName]) as readonly unknown[],
  details: () => [...runsQueryKeys.all(), "detail"] as const,
  detail: (projectName: string, runKey: string, branch?: string) =>
    [
      ...runsQueryKeys.details(),
      projectName,
      runKey,
      ...(branch ? [branch] : []),
    ] as const,
  statuses: () => [...runsQueryKeys.all(), "status"] as const,
  status: (projectName: string, runKey: string, branch?: string) =>
    [
      ...runsQueryKeys.statuses(),
      projectName,
      runKey,
      ...(branch ? [branch] : []),
    ] as const,
} as const;
