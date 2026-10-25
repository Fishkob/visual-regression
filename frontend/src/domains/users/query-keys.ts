// The users list is small and unpaginated, so one key covers it; `all()` is the
// prefix every user write invalidates.
export const userQueryKeys = {
  all: () => ["users"] as const,
  list: () => [...userQueryKeys.all(), "list"] as const,
} as const;
