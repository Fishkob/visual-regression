export const groupQueryKeys = {
  all: () => ["groups"] as const,
  list: () => [...groupQueryKeys.all(), "list"] as const,
} as const;
