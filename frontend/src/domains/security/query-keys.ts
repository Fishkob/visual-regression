// Sessions are the only cached security read; the 2FA setup secret and recovery
// codes are one-shot mutation answers and must never be cached. `all()` is the
// prefix a security write invalidates.
export const securityQueryKeys = {
  all: () => ["security"] as const,
  sessions: () => [...securityQueryKeys.all(), "sessions"] as const,
} as const;
