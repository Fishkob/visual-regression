import type { DailyOutcomeDto, TrendsDto } from "@sdk";
import type {
  ApprovalLatencyTrend,
  DailyOutcome,
  FlakeRateTrend,
  PendingReviewTrend,
  ProjectTrends,
} from "./trends.model";

// The generated DTO declares the counters as numbers, but the raw aggregate is a
// SQL count and a future shape can arrive as a numeric string; normalizing here
// keeps "0" and NaN out of the cards.
function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function mapDailyOutcome(dto: DailyOutcomeDto): DailyOutcome {
  const changed = toCount(dto.changed);
  const unchanged = toCount(dto.unchanged);
  const withinThreshold = toCount(dto.withinThreshold);
  return {
    date: dto.date ?? "",
    changed,
    unchanged,
    withinThreshold,
    total: changed + unchanged + withinThreshold,
  };
}

// The endpoint answers oldest day first; the table renders that order as-is.
export function mapDailyOutcomes(
  dtos: DailyOutcomeDto[] | null | undefined,
): DailyOutcome[] {
  return (dtos ?? []).map(mapDailyOutcome);
}

function mapPendingReview(
  dto: TrendsDto["pendingReview"] | undefined,
): PendingReviewTrend {
  return {
    count: toCount(dto?.count),
    avgSeconds: toCount(dto?.avgSeconds),
    maxSeconds: toCount(dto?.maxSeconds),
  };
}

function mapApprovalLatency(
  dto: TrendsDto["approvalLatency"] | undefined,
): ApprovalLatencyTrend {
  return {
    count: toCount(dto?.count),
    avgSeconds: toCount(dto?.avgSeconds),
  };
}

function mapFlakeRate(dto: TrendsDto["flakeRate"] | undefined): FlakeRateTrend {
  return {
    flakyTests: toCount(dto?.flakyTests),
    totalTests: toCount(dto?.totalTests),
    rate: toCount(dto?.rate),
  };
}

export function mapProjectTrends(
  dto: TrendsDto | undefined,
): ProjectTrends | undefined {
  if (!dto) return undefined;
  return {
    from: dto.from ?? "",
    to: dto.to ?? "",
    days: toCount(dto.days),
    daily: mapDailyOutcomes(dto.daily),
    pendingReview: mapPendingReview(dto.pendingReview),
    approvalLatency: mapApprovalLatency(dto.approvalLatency),
    flakeRate: mapFlakeRate(dto.flakeRate),
  };
}
