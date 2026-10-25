// Metadata is per test per branch: a rename or mute on one branch must not
// invalidate (or reuse) another branch's metadata. `all()` and `details()` stay
// prefixes for invalidation.
export const testMetadataQueryKeys = {
  all: () => ["test-metadata"] as const,
  details: () => [...testMetadataQueryKeys.all(), "detail"] as const,
  detail: (projectName: string, testName: string, branch?: string) =>
    [
      ...testMetadataQueryKeys.details(),
      projectName,
      testName,
      ...(branch ? [branch] : []),
    ] as const,
} as const;
