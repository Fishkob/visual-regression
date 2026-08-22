export const projectQueryKeys = {
  all: () => ["projects"] as const,
  withPending: () => [...projectQueryKeys.all(), "pending"] as const,
  detail: (projectName: string) =>
    [...projectQueryKeys.all(), "detail", projectName] as const,
} as const;
