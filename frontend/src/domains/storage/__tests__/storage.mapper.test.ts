import { describe, expect, it } from "vitest";
import type { StorageUsageDto } from "@sdk";
import {
  bytesToMegabytes,
  formatBytes,
  formatPercent,
  megabytesToByteString,
  retentionLabel,
} from "../storage.model";
import {
  mapRetentionPreview,
  mapStorage,
  type RetentionPreviewSource,
  type StorageSource,
} from "../storage.mapper";

const storageDto = (overrides: Partial<StorageSource> = {}): StorageSource => ({
  usageBytes: "1572864",
  quotaBytes: "10485760",
  percent: 15,
  softPercent: 80,
  warning: false,
  fileCount: 12,
  diffCount: 4,
  baselineRevisionLimit: 5,
  runHistoryDays: 30,
  branchRetentionDays: 30,
  orphanGraceHours: 24,
  ...overrides,
});

describe("formatBytes", () => {
  it("formats bytes with binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
    expect(formatBytes(1_073_741_824)).toBe("1.0 GB");
  });

  it("renders missing or invalid sizes as a dash", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});

describe("byte/MB conversions", () => {
  it("converts MB to a plain byte string and back", () => {
    expect(megabytesToByteString(10)).toBe("10485760");
    expect(megabytesToByteString(0.5)).toBe("524288");
    expect(bytesToMegabytes(10_485_760)).toBe(10);
    expect(bytesToMegabytes(1_572_864)).toBe(1.5);
  });

  it("maps an empty value to no quota", () => {
    expect(megabytesToByteString(null)).toBeNull();
    expect(megabytesToByteString(-1)).toBeNull();
    expect(bytesToMegabytes(null)).toBeNull();
  });
});

describe("formatPercent", () => {
  it("formats one decimal", () => {
    expect(formatPercent(15)).toBe("15.0%");
    expect(formatPercent(33.333)).toBe("33.3%");
    expect(formatPercent(Number.NaN)).toBe("0.0%");
  });
});

describe("retentionLabel", () => {
  it("names the global default or the stored value", () => {
    expect(retentionLabel(null, "days")).toBe("Global default");
    expect(retentionLabel(30, "days")).toBe("30 days");
    expect(retentionLabel(5, "revisions")).toBe("5 revisions");
  });
});

describe("mapStorage", () => {
  it("maps the byte strings and every field", () => {
    expect(mapStorage(storageDto())).toEqual({
      usageBytes: 1_572_864,
      quotaBytes: 10_485_760,
      percent: 15,
      softPercent: 80,
      warning: false,
      fileCount: 12,
      diffCount: 4,
      baselineRevisionLimit: 5,
      runHistoryDays: 30,
      branchRetentionDays: 30,
      orphanGraceHours: 24,
    });
  });

  it("keeps a missing quota as null and maps the warning", () => {
    const mapped = mapStorage(
      storageDto({
        quotaBytes: null,
        percent: 0,
        warning: true,
        baselineRevisionLimit: null,
        runHistoryDays: null,
        branchRetentionDays: null,
        orphanGraceHours: null,
      }),
    );

    expect(mapped?.quotaBytes).toBeNull();
    expect(mapped?.warning).toBe(true);
    expect(mapped?.baselineRevisionLimit).toBeNull();
    expect(mapped?.runHistoryDays).toBeNull();
    expect(mapped?.branchRetentionDays).toBeNull();
    expect(mapped?.orphanGraceHours).toBeNull();
  });

  it("defaults an omitted quota and soft percent defensively", () => {
    const dto = {
      usageBytes: 2048,
      percent: 40,
      warning: false,
      fileCount: 1,
      diffCount: 0,
      baselineRevisionLimit: undefined,
      runHistoryDays: undefined,
      branchRetentionDays: undefined,
      orphanGraceHours: undefined,
    } as unknown as StorageUsageDto;

    const mapped = mapStorage(dto);

    expect(mapped?.quotaBytes).toBeNull();
    expect(mapped?.softPercent).toBe(80);
    expect(mapped?.usageBytes).toBe(2048);
  });

  it("normalizes an unparseable usage string to zero", () => {
    expect(mapStorage(storageDto({ usageBytes: "many" }))?.usageBytes).toBe(0);
    expect(mapStorage(storageDto({ usageBytes: undefined }))?.usageBytes).toBe(
      0,
    );
  });

  it("keeps 'not loaded' distinct from empty storage", () => {
    expect(mapStorage(undefined)).toBeUndefined();
  });
});

const previewDto = (
  overrides: Partial<RetentionPreviewSource> = {},
): RetentionPreviewSource => ({
  baselineRevisions: { limit: 5, overflow: 2 },
  runs: { days: 30, eligible: 1 },
  branches: { days: 90, eligible: 3 },
  effectiveOrphanGraceHours: 24,
  storage: {
    usageBytes: "1572864",
    quotaBytes: "10485760",
    percent: 15,
    warning: false,
  },
  ...overrides,
});

describe("mapRetentionPreview", () => {
  it("maps the dry-run counts and the nested storage summary", () => {
    expect(mapRetentionPreview(previewDto())).toEqual({
      baselineRevisions: { limit: 5, overflow: 2 },
      runs: { days: 30, eligible: 1 },
      branches: { days: 90, eligible: 3 },
      effectiveOrphanGraceHours: 24,
      storage: {
        usageBytes: 1_572_864,
        quotaBytes: 10_485_760,
        percent: 15,
        warning: false,
      },
    });
  });

  it("keeps a missing quota and the warning flag", () => {
    const preview = mapRetentionPreview(
      previewDto({
        storage: {
          usageBytes: "2048",
          quotaBytes: null,
          percent: 0,
          warning: true,
        },
      }),
    );

    expect(preview?.storage.quotaBytes).toBeNull();
    expect(preview?.storage.warning).toBe(true);
    expect(preview?.storage.usageBytes).toBe(2048);
  });

  it("defaults missing nested sections defensively", () => {
    const dto = {} as unknown as RetentionPreviewSource;

    expect(mapRetentionPreview(dto)).toEqual({
      baselineRevisions: { limit: 0, overflow: 0 },
      runs: { days: 0, eligible: 0 },
      branches: { days: 0, eligible: 0 },
      effectiveOrphanGraceHours: 0,
      storage: { usageBytes: 0, quotaBytes: null, percent: 0, warning: false },
    });
  });

  it("keeps 'not loaded' distinct from an empty preview", () => {
    expect(mapRetentionPreview(undefined)).toBeUndefined();
  });
});
