import { describe, expect, it } from "vitest";
import type { TrendsDto } from "@sdk";
import {
  mapDailyOutcome,
  mapDailyOutcomes,
  mapProjectTrends,
} from "../trends.mapper";
import {
  formatAverage,
  formatDuration,
  formatRate,
  trendTotals,
  type DailyOutcome,
} from "../trends.model";

const trendsDto = (overrides: Partial<TrendsDto> = {}): TrendsDto => ({
  from: "2026-09-20",
  to: "2026-10-20",
  days: 30,
  daily: [
    { date: "2026-10-19", changed: 2, unchanged: 5, withinThreshold: 1 },
    { date: "2026-10-20", changed: 1, unchanged: 0, withinThreshold: 2 },
  ],
  pendingReview: { count: 3, avgSeconds: 11_520, maxSeconds: 172_800 },
  approvalLatency: { count: 4, avgSeconds: 720 },
  flakeRate: { flakyTests: 1, totalTests: 4, rate: 0.25 },
  ...overrides,
});

const day = (overrides: Partial<DailyOutcome> = {}): DailyOutcome => ({
  date: "2026-10-20",
  changed: 2,
  unchanged: 3,
  withinThreshold: 1,
  total: 6,
  ...overrides,
});

describe("mapDailyOutcome", () => {
  it("maps the buckets and pre-sums the row total", () => {
    expect(
      mapDailyOutcome({
        date: "2026-10-20",
        changed: 2,
        unchanged: 5,
        withinThreshold: 1,
      }),
    ).toEqual({
      date: "2026-10-20",
      changed: 2,
      unchanged: 5,
      withinThreshold: 1,
      total: 8,
    });
  });

  it("normalizes a non-numeric counter to zero", () => {
    const dto = {
      date: "2026-10-20",
      changed: "2",
      unchanged: 1,
      withinThreshold: 0,
    } as unknown as Parameters<typeof mapDailyOutcome>[0];

    expect(mapDailyOutcome(dto)).toEqual({
      date: "2026-10-20",
      changed: 0,
      unchanged: 1,
      withinThreshold: 0,
      total: 1,
    });
  });
});

describe("mapDailyOutcomes", () => {
  it("preserves the oldest-first order", () => {
    const rows = mapDailyOutcomes(
      trendsDto().daily as Parameters<typeof mapDailyOutcomes>[0],
    );
    expect(rows.map((row) => row.date)).toEqual(["2026-10-19", "2026-10-20"]);
  });

  it("maps an undefined list to an empty list", () => {
    expect(mapDailyOutcomes(undefined)).toEqual([]);
  });
});

describe("mapProjectTrends", () => {
  it("maps the window, its daily rows and every summary", () => {
    expect(mapProjectTrends(trendsDto())).toEqual({
      from: "2026-09-20",
      to: "2026-10-20",
      days: 30,
      daily: [
        {
          date: "2026-10-19",
          changed: 2,
          unchanged: 5,
          withinThreshold: 1,
          total: 8,
        },
        {
          date: "2026-10-20",
          changed: 1,
          unchanged: 0,
          withinThreshold: 2,
          total: 3,
        },
      ],
      pendingReview: { count: 3, avgSeconds: 11_520, maxSeconds: 172_800 },
      approvalLatency: { count: 4, avgSeconds: 720 },
      flakeRate: { flakyTests: 1, totalTests: 4, rate: 0.25 },
    });
  });

  it("defaults missing sections and a missing payload", () => {
    const dto = {
      from: "2026-09-20",
      to: "2026-10-20",
      days: 30,
      daily: [],
    } as unknown as TrendsDto;

    expect(mapProjectTrends(dto)).toEqual({
      from: "2026-09-20",
      to: "2026-10-20",
      days: 30,
      daily: [],
      pendingReview: { count: 0, avgSeconds: 0, maxSeconds: 0 },
      approvalLatency: { count: 0, avgSeconds: 0 },
      flakeRate: { flakyTests: 0, totalTests: 0, rate: 0 },
    });
    expect(mapProjectTrends(undefined)).toBeUndefined();
  });
});

describe("trendTotals", () => {
  it("sums the window's buckets and totals", () => {
    expect(trendTotals([day(), day({ changed: 1, total: 4 })])).toEqual({
      changed: 3,
      unchanged: 6,
      withinThreshold: 2,
      total: 10,
    });
  });

  it("returns zeroed totals for an empty window", () => {
    expect(trendTotals([])).toEqual({
      changed: 0,
      unchanged: 0,
      withinThreshold: 0,
      total: 0,
    });
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes, hours and days", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(720)).toBe("12 min");
    expect(formatDuration(11_520)).toBe("3.2 h");
    expect(formatDuration(172_800)).toBe("2.0 d");
  });

  it("renders a missing or invalid duration as a dash", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

describe("formatRate", () => {
  it("formats a 0..1 rate as one-decimal percent", () => {
    expect(formatRate(0.25)).toBe("25.0%");
    expect(formatRate(1 / 3)).toBe("33.3%");
    expect(formatRate(0)).toBe("0.0%");
    expect(formatRate(1)).toBe("100.0%");
  });

  it("formats a missing rate as zero", () => {
    expect(formatRate(undefined)).toBe("0.0%");
    expect(formatRate(Number.NaN)).toBe("0.0%");
  });
});

describe("formatAverage", () => {
  it("formats the average only when the window has samples", () => {
    expect(formatAverage(0, 720)).toBe("—");
    expect(formatAverage(2, 720)).toBe("12 min");
  });
});
