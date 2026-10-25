export const DEFAULT_PAGE = 0;
export const DEFAULT_PAGE_SIZE = 100;
// One page of the project list. Small enough to page through visibly, large
// enough that most installations never see a second page.
export const PROJECTS_PAGE_SIZE = 25;
// The review inbox is a triage queue: a larger page keeps a project's pending
// items together on one page more often.
export const INBOX_PAGE_SIZE = 50;
// The project detail pages variant rows: a viewport/browser/environment matrix
// multiplies rows, so this is larger than the project list's page.
export const PROJECT_DETAIL_PAGE_SIZE = 50;

export interface PageFetch<T> {
  items: T[];
  total?: number;
}

// Deep module over the "fetch every row of a paginated list" loop. Callers hand
// it a page fetcher and get back every row, paging past the first page using
// the backend's authoritative total. A truncated page silently drops data (the
// review pass would end early, a project list would show 100 of 300), so this
// is the single home of the "fetch all" rule instead of each list re-deriving
// it — and drifting. If total is missing, the all.length fallback ends the
// loop exactly like the last-fetched page size.
export async function fetchAllPages<T>(
  fetchPage: (skip: number) => Promise<PageFetch<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let skip = DEFAULT_PAGE;
  while (true) {
    const { items, total } = await fetchPage(skip);
    if (items.length === 0) break;
    all.push(...items);
    const target = total ?? all.length;
    if (all.length >= target) break;
    skip += DEFAULT_PAGE_SIZE;
  }
  return all;
}
