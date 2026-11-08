// Sessions are the security read; `all()` is the prefix a security write
// invalidates.
export const securityQueryKeys = {
  all: () => ["security"] as const,
  sessions: () => [...securityQueryKeys.all(), "sessions"] as const,
} as const;
