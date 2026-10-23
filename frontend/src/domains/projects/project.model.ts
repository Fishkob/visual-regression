import type { TestStatusValue } from "@/domains/test-status";
import type { TestKind } from "@/domains/test-kind";

export interface VisualTestItem {
  name?: string;
  kind?: TestKind;
  viewport?: string;
  browser?: string;
  environment?: string;
  latestStatus?: TestStatusValue;
}

export interface Project {
  id: string;
  name: string;
  hasPendingTests: boolean;
  groupId?: string | null;
  groupName?: string | null;
  pendingCount?: number;
  testCount?: number;
  visualTests?: VisualTestItem[];
  createdAt?: string;
}
