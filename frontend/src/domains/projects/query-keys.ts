import type { TestKind } from "@/domains/test-kind";

export interface ProjectsListQuery {
  page?: number;
  q?: string;
  groupId?: string;
}

// The project overview's server-side query: one page of variant rows plus the
// table filters. Every value is optional; `page` defaults on the server.
export interface ProjectDetailQuery {
  page?: number;
  q?: string;
  kind?: TestKind;
  status?: "pending" | "ok";
  viewport?: string;
  browser?: string;
  environment?: string;
}

export const projectQueryKeys = {
  all: () => ["projects"] as const,
  // The unpaginated list used by pickers (e.g. an API key's project allowlist).
  allProjects: () => [...projectQueryKeys.all(), "all"] as const,
  // The filter/page object is part of the key so navigating a page or changing
  // a filter fetches its own page instead of reusing the previous result.
  // Omitting the query yields the list prefix, which invalidates every page.
  withPending: (query?: ProjectsListQuery) =>
    (query
      ? [...projectQueryKeys.all(), "pending", query]
      : [...projectQueryKeys.all(), "pending"]) as readonly unknown[],
  // The branch (and the page/filter object, when present) is appended after the
  // name, so `detail(projectName)` stays a prefix that invalidates every branch
  // and page variant of that project.
  detail: (
    projectName: string,
    branchName?: string,
    query?: ProjectDetailQuery,
  ) =>
    [
      ...projectQueryKeys.all(),
      "detail",
      projectName,
      ...(branchName ? [branchName] : []),
      ...(query ? [query] : []),
    ] as const,
} as const;
