import type { RetentionPreviewDto, StorageUsageDto } from "@sdk";
import type { ProjectStorage, RetentionPreview } from "./storage.model";

// The generated DTO types the byte columns as strings; a hand-built payload can
// also carry a number, so both are normalized to one number for the UI.
export type StorageSource = Omit<
  StorageUsageDto,
  "usageBytes" | "quotaBytes"
> & {
  usageBytes?: unknown;
  quotaBytes?: unknown;
};

function toBytes(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toLimit(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Undefined stays undefined so a query can tell "not loaded" from real data;
// every field the server omits gets a safe default rather than a null hole.
export function mapStorage(
  dto: StorageSource | undefined,
): ProjectStorage | undefined {
  if (!dto) return undefined;
  return {
    usageBytes: toBytes(dto.usageBytes) ?? 0,
    quotaBytes: toBytes(dto.quotaBytes),
    percent: toCount(dto.percent),
    // The backend's default soft threshold is 80%; keep that fallback if an
    // older payload omits it.
    softPercent: typeof dto.softPercent === "number" ? dto.softPercent : 80,
    warning: dto.warning === true,
    fileCount: toCount(dto.fileCount),
    diffCount: toCount(dto.diffCount),
    baselineRevisionLimit: toLimit(dto.baselineRevisionLimit),
    runHistoryDays: toLimit(dto.runHistoryDays),
    branchRetentionDays: toLimit(dto.branchRetentionDays),
    orphanGraceHours: toLimit(dto.orphanGraceHours),
  };
}

// The preview nests a byte-string storage summary just like the usage read; the
// source widens those columns so the mapper accepts both strings and numbers.
export type RetentionPreviewSource = Omit<RetentionPreviewDto, "storage"> & {
  storage?: {
    usageBytes?: unknown;
    quotaBytes?: unknown;
    percent?: unknown;
    warning?: unknown;
  };
};

export function mapRetentionPreview(
  dto: RetentionPreviewSource | undefined,
): RetentionPreview | undefined {
  if (!dto) return undefined;
  return {
    baselineRevisions: {
      limit: toCount(dto.baselineRevisions?.limit),
      overflow: toCount(dto.baselineRevisions?.overflow),
    },
    runs: {
      days: toCount(dto.runs?.days),
      eligible: toCount(dto.runs?.eligible),
    },
    branches: {
      days: toCount(dto.branches?.days),
      eligible: toCount(dto.branches?.eligible),
    },
    effectiveOrphanGraceHours: toCount(dto.effectiveOrphanGraceHours),
    storage: {
      usageBytes: toBytes(dto.storage?.usageBytes) ?? 0,
      quotaBytes: toBytes(dto.storage?.quotaBytes),
      percent: toCount(dto.storage?.percent),
      warning: dto.storage?.warning === true,
    },
  };
}
