// The visual-tests filter vocabulary. Lives in the status domain so a filter
// bar imports vocabulary from a domain, not from a sibling composable that
// also happens to own the filter state. The values are deliberately distinct
// from STATUS.*: "pending" here means "awaiting review"
// (STATUS.PENDING_APPROVAL), not the no-baseline domain status — keeping the
// strings separate stops one value from meaning two things inside the feature.
export const FILTER_ALL = "__all";
export const STATUS_FILTER_PENDING = "filter:pending";
export const STATUS_FILTER_OK = "filter:ok";

// The filter state consumed as one object so a filter bar binds a single
// v-model instead of threading five individual refs.
export interface VisualTestFilters {
  search: string;
  viewport: string;
  browser: string;
  environment: string;
  status: string;
}
