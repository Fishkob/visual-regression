export const shareLinkQueryKeys = {
  all: () => ["share-links"] as const,
  list: (projectName: string) =>
    [...shareLinkQueryKeys.all(), projectName] as const,
} as const;
