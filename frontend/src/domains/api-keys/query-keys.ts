export const apiKeyQueryKeys = {
  all: () => ["api-keys"] as const,
  list: () => [...apiKeyQueryKeys.all(), "list"] as const,
} as const;
