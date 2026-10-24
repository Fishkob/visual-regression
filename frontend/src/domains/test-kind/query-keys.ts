// The test-kind query identity. The kind fetch belongs to the test-kind domain
// — the same home as the vocabulary — so a caller that wants "what kind is this
// test" crosses one module instead of assembling vocabulary + key + fetch.
export const testKindQueryKeys = {
  all: () => ["test-kind"] as const,
  // The branch is appended only when one is selected, so the default-branch
  // read keeps its key while a branch-scoped read gets its own cache entry (and
  // the all() prefix still matches both).
  kind: (projectName: string, testName: string, branchName?: string) =>
    [
      ...testKindQueryKeys.all(),
      "kind",
      projectName,
      testName,
      ...(branchName ? [branchName] : []),
    ] as const,
} as const;
