import type { StatusValue } from "@/domains/test-status";
import { iconFor } from "@/domains/test-status";
import type { VisualTestItem } from "./project.model";

// The directory's accordion-group shape: a distinct test (by name) with the
// badge buckets its header renders. Lives in the projects domain so the
// presentational group component and the table composable cross the same seam
// instead of one importing a type from the other.
export interface TestGroupBadge {
  status: StatusValue;
  count: number;
  icon: ReturnType<typeof iconFor>;
}

export interface TestGroup {
  name: string;
  items: VisualTestItem[];
  badges: TestGroupBadge[];
}
