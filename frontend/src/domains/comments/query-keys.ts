export interface CommentListFilters {
  comparisonId?: string;
  branch?: string;
}

export const commentQueryKeys = {
  all: () => ["comments"] as const,
  lists: () => [...commentQueryKeys.all(), "list"] as const,
  list: (
    projectName: string,
    testName: string,
    filters: CommentListFilters = {},
  ) => [...commentQueryKeys.lists(), projectName, testName, filters] as const,
} as const;
