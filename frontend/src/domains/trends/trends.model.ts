// The two ranges the page offers. Kept as a list so the toggle is data, not two
// near-identical branches; the API clamps anything outside 1..365 anyway.
export const TREND_RANGES = [30, 90] as const;

export type TrendRange = (typeof TREND_RANGES)[number];

export const DEFAULT_TREND_RANGE: TrendRange = 30;

export interface DailyOutcome {
  /** ISO calendar day the outcomes were recorded on (`YYYY-MM-DD`). */
  date: string;
  changed: number;
  unchanged: number;
  withinThreshold: number;
  /** The row's three outcome buckets, pre-summed for the table's total column. */
  total: number;
}

export interface PendingReviewTrend {
  count: number;
  avgSeconds: number;
  maxSeconds: number;
}

export interface ApprovalLatencyTrend {
  count: number;
  avgSeconds: number;
}

export interface FlakeRateTrend {
  flakyTests: number;
  totalTests: number;
  /** 0..1; the view formats it as a percentage. */
  rate: number;
}

export interface ProjectTrends {
  from: string;
  to: string;
  days: number;
  daily: DailyOutcome[];
  pendingReview: PendingReviewTrend;
  approvalLatency: ApprovalLatencyTrend;
  flakeRate: FlakeRateTrend;
}

export interface TrendTotals {
  changed: number;
  unchanged: number;
  withinThreshold: number;
  total: number;
}

// The summary card adds the window's buckets; the daily rows already carry their
// own total, so this is the same rule applied once more.
export function trendTotals(daily: readonly DailyOutcome[]): TrendTotals {
  return daily.reduce<TrendTotals>(
    (totals, row) => ({
      changed: totals.changed + row.changed,
      unchanged: totals.unchanged + row.unchanged,
      withinThreshold: totals.withinThreshold + row.withinThreshold,
      total: totals.total + row.total,
    }),
    { changed: 0, unchanged: 0, withinThreshold: 0, total: 0 },
  );
}

// Durations arrive as seconds and span minutes to days; one decimal is enough
// for hours/days, whole units are what a reviewer reads for seconds/minutes.
export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)} h`;
  return `${(seconds / 86_400).toFixed(1)} d`;
}

// The API answers a 0..1 rate; the UI speaks percent, one decimal so a small
// flake rate does not collapse to "0%".
export function formatRate(rate: number | null | undefined): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "0.0%";
  return `${(rate * 100).toFixed(1)}%`;
}

// A count with no samples has no meaningful average: the cards show this instead
// of a misleading "0 s".
export function formatAverage(
  count: number,
  avgSeconds: number | null | undefined,
): string {
  return count > 0 ? formatDuration(avgSeconds) : "—";
}
