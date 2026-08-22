// The test-kind query identity. The kind fetch belongs to the test-kind domain
// — the same home as the vocabulary — so a caller that wants "what kind is this
// test" crosses one module instead of assembling vocabulary + key + fetch.
export const testKindQueryKeys = {
  all: () => ["test-kind"] as const,
  kind: (projectName: string, testName: string) =>
    [...testKindQueryKeys.all(), "kind", projectName, testName] as const,
} as const;
