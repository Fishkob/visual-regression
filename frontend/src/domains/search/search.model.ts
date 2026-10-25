import { isTestKind, type TestKind } from "@/domains/test-kind";

export type SearchResultKind = "project" | "test" | "branch";

export const SEARCH_RESULT_KINDS: readonly SearchResultKind[] = [
  "project",
  "test",
  "branch",
];

export interface SearchProject {
  name: string;
}

export interface SearchTest {
  projectName: string;
  branchName: string;
  testName: string;
  kind?: TestKind;
  status: string;
}

export interface SearchBranch {
  projectName: string;
  branchName: string;
  isDefault: boolean;
}

export interface SearchResults {
  query: string;
  projects: SearchProject[];
  tests: SearchTest[];
  branches: SearchBranch[];
}

// One selectable row: also the persisted recents/favorites shape, because the
// palette must be able to navigate a stored entry without re-fetching anything.
export interface SearchResultItem {
  id: string;
  kind: SearchResultKind;
  label: string;
  description?: string;
  path: string;
}

export const SEARCH_RECENT_LIMIT = 5;
export const SEARCH_MIN_QUERY_LENGTH = 1;
export const SEARCH_DEBOUNCE_MS = 275;
export const SEARCH_RESULT_LIMIT = 8;

export function projectSearchPath(projectName: string): string {
  return `/projects/${encodeURIComponent(projectName)}`;
}

export function testSearchPath(
  projectName: string,
  testName: string,
  branchName?: string,
): string {
  const base = `${projectSearchPath(projectName)}/tests/${encodeURIComponent(
    testName,
  )}`;
  return branchName ? `${base}?branch=${encodeURIComponent(branchName)}` : base;
}

// The project detail page resolves a `?branch=` query, so a branch result lands
// on that branch's variant list.
export function branchSearchPath(
  projectName: string,
  branchName: string,
): string {
  return `${projectSearchPath(projectName)}?branch=${encodeURIComponent(
    branchName,
  )}`;
}

function projectItem(project: SearchProject): SearchResultItem {
  return {
    id: projectSearchPath(project.name),
    kind: "project",
    label: project.name,
    path: projectSearchPath(project.name),
  };
}

function testItem(test: SearchTest): SearchResultItem {
  return {
    id: testSearchPath(test.projectName, test.testName, test.branchName),
    kind: "test",
    label: test.testName,
    description: `${test.projectName} · ${test.branchName}${
      isTestKind(test.kind) ? ` · ${test.kind === "pdf" ? "PDF" : "Image"}` : ""
    }`,
    path: testSearchPath(test.projectName, test.testName, test.branchName),
  };
}

function branchItem(branch: SearchBranch): SearchResultItem {
  return {
    id: branchSearchPath(branch.projectName, branch.branchName),
    kind: "branch",
    label: `${branch.projectName} · ${branch.branchName}`,
    description: branch.isDefault ? "Default branch" : "Branch",
    path: branchSearchPath(branch.projectName, branch.branchName),
  };
}

// The keyboard order is exactly the render order: projects, then tests, then
// branches. Sections keep their own arrays and use the offsets below.
export function searchResultItems(results: SearchResults): SearchResultItem[] {
  return [
    ...results.projects.map(projectItem),
    ...results.tests.map(testItem),
    ...results.branches.map(branchItem),
  ];
}

export function isSearchResultItem(value: unknown): value is SearchResultItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.kind === "string" &&
    SEARCH_RESULT_KINDS.includes(item.kind as SearchResultKind) &&
    typeof item.label === "string" &&
    typeof item.path === "string" &&
    item.path.length > 0 &&
    (item.description === undefined || typeof item.description === "string")
  );
}

export function rememberRecent(
  entries: readonly SearchResultItem[],
  item: SearchResultItem,
  limit = SEARCH_RECENT_LIMIT,
): SearchResultItem[] {
  return [item, ...entries.filter((entry) => entry.id !== item.id)].slice(
    0,
    limit,
  );
}

export function isFavorite(
  favorites: readonly SearchResultItem[],
  id: string,
): boolean {
  return favorites.some((favorite) => favorite.id === id);
}

export function toggleFavorite(
  favorites: readonly SearchResultItem[],
  item: SearchResultItem,
): SearchResultItem[] {
  return isFavorite(favorites, item.id)
    ? favorites.filter((favorite) => favorite.id !== item.id)
    : [item, ...favorites];
}
