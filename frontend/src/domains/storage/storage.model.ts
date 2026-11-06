export const BYTES_PER_MB = 1024 * 1024;

// The API speaks bytes (as a decimal string, because a quota can exceed
// Number.MAX_SAFE_INTEGER); the panel and the editor speak human units. These
// helpers are the only conversion point, so the editor's "MB" and the panel's
// "MB" can never disagree.
export interface ProjectStorage {
  usageBytes: number;
  quotaBytes: number | null;
  percent: number;
  softPercent: number;
  warning: boolean;
  fileCount: number;
  diffCount: number;
  baselineRevisionLimit: number | null;
  runHistoryDays: number | null;
  branchRetentionDays: number | null;
  orphanGraceHours: number | null;
}

// The dry-run answer: what retention would delete right now. Read-only — the
// endpoint never deletes anything, and the dialog says so.
//
// `effectiveOrphanGraceHours` is the value the sweeps will apply, with the global
// default resolved. `ProjectStorage.orphanGraceHours` is the *stored* setting
// (null = "no override"), which is what the edit form prefills.
export interface RetentionPreview {
  baselineRevisions: {
    limit: number;
    overflow: number;
  };
  runs: {
    days: number;
    eligible: number;
  };
  // Days without an upload after which a branch is deleted; `0` is off, which
  // the dialog says explicitly instead of showing a 0-day window.
  branches: {
    days: number;
    eligible: number;
  };
  effectiveOrphanGraceHours: number;
  storage: {
    usageBytes: number;
    quotaBytes: number | null;
    percent: number;
    warning: boolean;
  };
}

export interface UpdateProjectStorageInput {
  baselineRevisionLimit?: number | null;
  runHistoryDays?: number | null;
  branchRetentionDays?: number | null;
  orphanGraceHours?: number | null;
  storageQuotaBytes?: string | null;
  quotaSoftPercent?: number | null;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

// Human-readable size with binary units (the same 1024 factor the editor uses
// when it converts MB back to a byte string).
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

export function bytesToMegabytes(bytes: number | null): number | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  return Number((bytes / BYTES_PER_MB).toFixed(3));
}

// A byte string, not a number: quotas are bigint server-side and the editor must
// not express one in scientific notation ("1e+21" fails BigInt parsing).
export function megabytesToByteString(megabytes: number | null): string | null {
  if (megabytes === null || !Number.isFinite(megabytes) || megabytes < 0) {
    return null;
  }
  return Math.round(megabytes * BYTES_PER_MB).toFixed(0);
}

export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent)) return "0.0%";
  return `${percent.toFixed(1)}%`;
}

export function retentionLabel(value: number | null, unit: string): string {
  return value === null ? "Global default" : `${value} ${unit}`;
}
