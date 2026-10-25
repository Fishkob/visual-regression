export const storageQueryKeys = {
  all: () => ["storage"] as const,
  // One read per project; the project name is part of the key so switching
  // projects never shows another project's usage while loading.
  detail: (projectName: string) =>
    [...storageQueryKeys.all(), projectName] as const,
  // The retention dry-run is a separate read: it is only fetched when the
  // preview dialog opens and must not be confused with the usage summary.
  preview: (projectName: string) =>
    [...storageQueryKeys.all(), "preview", projectName] as const,
} as const;
