export const teamQueryKeys = {
  all: () => ["teams"] as const,
  list: () => [...teamQueryKeys.all(), "list"] as const,
} as const;
