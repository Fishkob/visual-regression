import type { StatusValue } from "./types";

// The canonical status vocabulary. The domain owns the values, not just the
// predicates over them — presentation code imports these instead of spelling
// the literals, so a renamed or mistyped status is a compile error, not a
// silent "Baseline only" fallback.
export const STATUS = {
  PENDING: "PENDING",
  UNCHANGED: "UNCHANGED",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
} as const satisfies Record<string, StatusValue>;
