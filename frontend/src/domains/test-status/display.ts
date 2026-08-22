import type { StatusValue, TestStatusValue } from "./types";
import { STATUS } from "./values";

export type StatusIcon = "check" | "clock" | "help-circle";

export interface StatusConfig {
  class: string;
  icon: StatusIcon;
  label: string;
}

export const unknownStatusConfig: StatusConfig = {
  class: "border-slate-400 text-slate-500",
  icon: "help-circle",
  label: "Baseline only",
};

const unchangedConfig: StatusConfig = {
  class: "border-emerald-500 text-emerald-600",
  icon: "check",
  label: "Unchanged",
};

// The raw status→styling map is deliberately NOT exported: callers must cross
// the getStatusConfig seam so a status restyle (or a new status) has one place
// to change, and an unknown status always falls back to the baseline-only look.
const statusConfig: Record<StatusValue, StatusConfig> = {
  [STATUS.PENDING]: {
    class: "border-sky-500 text-sky-600",
    icon: "clock",
    label: "No baseline",
  },
  [STATUS.UNCHANGED]: unchangedConfig,
  [STATUS.PENDING_APPROVAL]: {
    class: "border-amber-500 text-amber-600",
    icon: "clock",
    label: "Pending",
  },
  [STATUS.APPROVED]: {
    ...unchangedConfig,
    label: "Approved",
  },
};

export function getStatusConfig(status?: string | null): StatusConfig {
  if (status != null && status in statusConfig) {
    return statusConfig[status as StatusValue];
  }
  return unknownStatusConfig;
}

// Narrow icon-only lookup so callers that just need the status icon (e.g. the
// group badge buckets in useVisualTestsTable) cross the same single map instead
// of re-declaring [status, icon] pairs that could drift from the config.
export function iconFor(status?: string | null): StatusIcon {
  return getStatusConfig(status).icon;
}

export function isPendingApproval(status: string | null | undefined): boolean {
  return status === STATUS.PENDING_APPROVAL;
}

export function isApproved(status: string | null | undefined): boolean {
  return status === STATUS.APPROVED;
}

// Single home for "count pending items in a collection". Callers pass the
// status selector because the domain models differ (visual tests carry
// latestStatus, PDF tests carry status); the counting rule itself lives here.
export function countPending<T>(
  items: readonly T[],
  getStatus: (item: T) => string | null | undefined,
): number {
  return items.filter((item) => isPendingApproval(getStatus(item))).length;
}

// Single home for "count a collection by its status values". Group summaries
// (the project-directory accordion buckets) must bucket by the STATUS.*
// vocabulary so a baseline-less variant reads "No baseline" instead of being
// swept into a "clean" count.
export function countStatuses<T>(
  items: readonly T[],
  getStatus: (item: T) => string | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const status = getStatus(item);
    if (status != null) {
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }
  return counts;
}

// The one "which status wins when a test has several" ordering. Both the
// aggregate rule (aggregateVariantStatuses) and the directory's group-badge
// buckets (useVisualTestsTable) iterate this same priority, so a new status is
// added to the priority exactly once and every consumer follows it.
export const TEST_STATUS_PRIORITY = [
  STATUS.PENDING_APPROVAL,
  STATUS.PENDING,
  STATUS.UNCHANGED,
] as const satisfies readonly TestStatusValue[];

// The aggregate rule for a test from its per-variant statuses: any pending
// variant makes the whole test PENDING_APPROVAL, any baseline-less variant
// makes it PENDING, and only a test whose variants are all clean reads
// UNCHANGED. A test with no variants reads PENDING. Mirrors the backend's
// persisted-status derivation so a directory and the server cannot drift.
export function aggregateVariantStatuses(
  statuses: readonly (string | null | undefined)[],
): TestStatusValue {
  if (statuses.length === 0) return STATUS.PENDING;
  for (const status of TEST_STATUS_PRIORITY) {
    if (statuses.includes(status)) return status;
  }
  return STATUS.UNCHANGED;
}
