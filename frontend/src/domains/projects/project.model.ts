import type { TestStatusValue } from "@/domains/test-status";
import type { TestKind } from "@/domains/test-kind";

import type { BranchOrigin } from "@/domains/branches/branch-origin";

export type { BranchOrigin };

export interface VisualTestItem {
  name?: string;
  kind?: TestKind;
  viewport?: string;
  browser?: string;
  environment?: string;
  latestStatus?: TestStatusValue;
  origin?: BranchOrigin;
  inheritedFrom?: string | null;
}

export interface ProjectPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ProjectFilterOptions {
  viewports: string[];
  browsers: string[];
  environments: string[];
}

export interface Project {
  id: string;
  name: string;
  hasPendingTests: boolean;
  groupId?: string | null;
  groupName?: string | null;
  branchName?: string;
  defaultBranchName?: string;
  requiredApprovals?: number;
  pixelDiffThreshold?: number | null;
  pendingCount?: number;
  testCount?: number;
  visualTests?: VisualTestItem[];
  createdAt?: string;
  meta?: ProjectPaginationMeta;
  filterOptions?: ProjectFilterOptions;
}
