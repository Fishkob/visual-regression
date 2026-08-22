export const DEFAULT_PAGE = 0;
export const DEFAULT_PAGE_SIZE = 100;

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
