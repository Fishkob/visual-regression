import { translateMessage as tm } from "@/lib/i18n-messages";
import type {
  PaginatedRunDto,
  RunApprovalDto,
  RunApproveAllResultDto,
  RunDetailDto,
  RunDto,
  RunPendingDto,
  RunStatusDto,
} from "@sdk";
import { isTestKind, type TestKind } from "@/domains/test-kind";
import {
  RUN_STATES,
  type Run,
  type RunApproval,
  type RunApproveAllFailure,
  type RunApproveAllPending,
  type RunApproveAllResult,
  type RunDetail,
  type RunPage,
  type RunPending,
  type RunState,
  type RunStatus,
} from "./run.model";

// The generated DTO types the nullable timestamp/metadata columns as free-form
// objects (the backend declares them nullable but untyped), so the source widens
// exactly those columns to `unknown` and the mapper normalizes every spelling to
// one absent value — same seam as the webhook mapper.
export type RunSource = Omit<
  RunDto,
  "commitSha" | "commitMessage" | "ciUrl" | "finishedAt" | "finishedBy"
> & {
  commitSha?: unknown;
  commitMessage?: unknown;
  ciUrl?: unknown;
  finishedAt?: unknown;
  finishedBy?: unknown;
};

function presentString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ciUrl is rendered as an anchor href. The API now rejects non-http(s) values at
// upload time, but rows written before that validation can still carry a
// `javascript:` payload, so the read path drops anything that is not an absolute
// http(s) URL.
function presentHttpUrl(value: unknown): string | null {
  const raw = presentString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function presentNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// The wire carries ISO strings; a `Date` is accepted too because the backend DTO
// declares these columns as dates and a direct (non-JSON) call would hand one
// over.
function presentIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return presentString(value);
}

function presentRunState(value: string | undefined): RunState {
  return RUN_STATES.find((state) => state === value) ?? "open";
}

// The pending row's variant is an untyped object on the wire and the page count
// is declared as one too, so the source widens them for the same reason as
// RunSource: the mapper accepts the generated type as-is and normalizes.
export type RunPendingSource = Omit<
  RunPendingDto,
  "variant" | "mismatchPageCount" | "muted"
> & {
  variant?: { [key: string]: unknown };
  mismatchPageCount?: unknown;
  muted?: unknown;
};

function toKind(kind: string | undefined): TestKind | undefined {
  return isTestKind(kind) ? kind : undefined;
}

export function mapRun(dto: RunSource): Run {
  return {
    id: String(dto.id ?? ""),
    key: dto.key ?? "",
    branchName: dto.branchName ?? "",
    commitSha: presentString(dto.commitSha),
    commitMessage: presentString(dto.commitMessage),
    ciUrl: presentHttpUrl(dto.ciUrl),
    createdAt: presentIso(dto.createdAt) ?? "",
    lastActivityAt: presentIso(dto.lastActivityAt) ?? "",
    finishedAt: presentIso(dto.finishedAt),
    finishedBy: presentString(dto.finishedBy),
  };
}

// The list endpoint answers newest first; mapping preserves that order.
export function mapRuns(dtos: RunDto[] | null | undefined): Run[] {
  return (dtos ?? []).map(mapRun);
}

export function mapRunStatus(dto: RunStatusDto | undefined): RunStatus {
  return {
    state: presentRunState(dto?.state),
    pendingComparisons: dto?.pendingComparisons ?? 0,
    mutedPending: dto?.mutedPending ?? 0,
    pendingJobs: dto?.pendingJobs ?? 0,
    failedJobs: dto?.failedJobs ?? 0,
    approved: dto?.approved ?? 0,
    testCount: dto?.testCount ?? 0,
  };
}

// The variant is a free-form payload on the wire; only the three identity parts
// the run page renders are projected, and an absent part stays absent instead of
// rendering as "undefined".
function variantParts(variant: { [key: string]: unknown } | undefined) {
  const viewport = presentString(variant?.viewport);
  const browser = presentString(variant?.browser);
  const environment = presentString(variant?.environment);
  return {
    ...(viewport ? { viewport } : {}),
    ...(browser ? { browser } : {}),
    ...(environment ? { environment } : {}),
  };
}

export function mapRunPending(dto: RunPendingSource): RunPending {
  return {
    comparisonId: dto.comparisonId,
    testName: dto.testName,
    kind: toKind(dto.kind),
    branchName: dto.branchName,
    ...variantParts(dto.variant),
    mismatchPixelCount: dto.mismatchPixelCount,
    mismatchPageCount: presentNumber(dto.mismatchPageCount),
    muted: dto.muted === true,
    createdAt: presentIso(dto.createdAt) ?? "",
  };
}

export function mapRunPendingList(
  dtos: RunPendingSource[] | null | undefined,
): RunPending[] {
  return (dtos ?? []).map(mapRunPending);
}

// The endpoint already answers newest-first; mapping preserves that order.
export function mapRunApproval(dto: RunApprovalDto): RunApproval {
  return {
    comparisonId: dto.comparisonId,
    testName: dto.testName,
    approvedBy: dto.approvedBy,
    approvedAt: presentIso(dto.approvedAt) ?? "",
  };
}

export function mapRunApprovalList(
  dtos: RunApprovalDto[] | null | undefined,
): RunApproval[] {
  return (dtos ?? []).map(mapRunApproval);
}

export function mapRunDetail(
  dto: RunDetailDto | undefined,
): RunDetail | undefined {
  if (!dto) return undefined;
  return {
    run: mapRun(dto.run),
    status: mapRunStatus(dto.status),
    pending: mapRunPendingList(dto.pending),
    approvals: mapRunApprovalList(dto.approvals),
    failedJobs: (dto.failedJobs ?? []).map((job) => ({
      id: job.id,
      testName: job.testName,
      branchName: job.branchName,
      error: job.error,
      createdAt: job.createdAt,
    })),
  };
}

export function mapRunPage(dto: PaginatedRunDto | undefined): RunPage {
  return {
    items: mapRuns(dto?.data),
    total: dto?.meta?.total ?? 0,
    page: dto?.meta?.page ?? 1,
    limit: dto?.meta?.limit ?? 0,
    totalPages: dto?.meta?.totalPages ?? 0,
  };
}

export function mapRunApproveAllFailure(dto: {
  [key: string]: unknown;
}): RunApproveAllFailure {
  return {
    comparisonId: presentString(dto.comparisonId) ?? "",
    error: presentString(dto.error) ?? tm("runs.unknownError"),
  };
}

export function mapRunApproveAllPending(dto: {
  [key: string]: unknown;
}): RunApproveAllPending {
  return {
    comparisonId: presentString(dto.comparisonId) ?? "",
    votes: typeof dto.votes === "number" ? dto.votes : 0,
    required: typeof dto.required === "number" ? dto.required : 0,
  };
}

// The batch answers partial results: a stale comparison fails alone, a 4-eyes
// vote stays pending, and only the remaining entries become baselines.
export function mapRunApproveAllResult(
  dto: RunApproveAllResultDto | undefined,
): RunApproveAllResult {
  return {
    approved: dto?.approved ?? 0,
    pending: (dto?.pending ?? []).map(mapRunApproveAllPending),
    failed: (dto?.failed ?? []).map(mapRunApproveAllFailure),
  };
}
