import type { TestKind } from "@/domains/test-kind";

export interface InboxListQuery {
  page?: number;
  q?: string;
  kind?: TestKind;
  groupId?: string;
  branch?: string;
  // The CI run a pending comparison was uploaded under. Optional: the inbox
  // keeps showing ungrouped uploads when no run filter is set.
  runKey?: string;
}

export const reviewInboxQueryKeys = {
  all: () => ["review-inbox"] as const,
  lists: () => [...reviewInboxQueryKeys.all(), "list"] as const,
  // Omitting the query yields the prefix, which invalidates every page.
  list: (query?: InboxListQuery) =>
    (query
      ? [...reviewInboxQueryKeys.lists(), query]
      : [...reviewInboxQueryKeys.lists()]) as readonly unknown[],
  branches: () => [...reviewInboxQueryKeys.all(), "branches"] as const,
  count: () => [...reviewInboxQueryKeys.all(), "count"] as const,
} as const;

export const pendingTestQueryKeys = {
  all: () => ["pending-tests"] as const,
  lists: () => [...pendingTestQueryKeys.all(), "list"] as const,
  // The branch part is appended only when one is selected, so the
  // project-default read keeps its stable key while a branch-scoped read gets
  // its own cache entry (and lists() prefix-matches both).
  list: (projectName: string, branchName?: string) =>
    [
      ...pendingTestQueryKeys.lists(),
      projectName,
      ...(branchName ? [branchName] : []),
    ] as const,
} as const;
