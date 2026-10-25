// Trends are project-scoped and the window is part of the read: a 30-day answer
// must not reuse the 90-day cache entry. `project()` is the prefix that would
// invalidate every window of one project.
export const trendsQueryKeys = {
  all: () => ["trends"] as const,
  project: (projectName: string) =>
    [...trendsQueryKeys.all(), projectName] as const,
  detail: (projectName: string, days: number) =>
    [...trendsQueryKeys.project(projectName), days] as const,
} as const;
