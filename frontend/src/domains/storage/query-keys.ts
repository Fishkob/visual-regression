export const storageQueryKeys = {
  all: () => ["storage"] as const,
  // One read per project; the project name is part of the key so switching
  // projects never shows another project's usage while loading.
  detail: (projectName: string) =>
    [...storageQueryKeys.all(), projectName] as const,
} as const;
