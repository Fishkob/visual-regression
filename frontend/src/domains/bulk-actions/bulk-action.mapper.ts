import type {
  BulkApprovalResultDto,
  BulkDeleteResultDto,
  BulkItemResultDto,
  BulkMoveResultDto,
  BulkPendingVoteDto,
} from "@sdk";
import type {
  BulkApproveResult,
  BulkDeleteResult,
  BulkItemResult,
  BulkMoveResult,
  BulkPendingVote,
} from "./bulk-action.model";

function presentString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function mapBulkItem(dto: BulkItemResultDto): BulkItemResult {
  return {
    id: String(dto.id ?? ""),
    success: dto.success === true,
    error: presentString(dto.error),
  };
}

function mapItems(
  dtos: BulkItemResultDto[] | null | undefined,
): BulkItemResult[] {
  return (dtos ?? []).map(mapBulkItem);
}

function mapPendingVote(dto: BulkPendingVoteDto): BulkPendingVote {
  return {
    id: String(dto.id ?? ""),
    votes: typeof dto.votes === "number" ? dto.votes : 0,
    required: typeof dto.required === "number" ? dto.required : 0,
  };
}

export function mapBulkApproveResult(
  dto: BulkApprovalResultDto | undefined,
): BulkApproveResult {
  return {
    approved: mapItems(dto?.approved),
    pending: (dto?.pending ?? []).map(mapPendingVote),
    failed: mapItems(dto?.failed),
  };
}

export function mapBulkMoveResult(
  dto: BulkMoveResultDto | undefined,
): BulkMoveResult {
  return {
    moved: mapItems(dto?.moved),
    failed: mapItems(dto?.failed),
  };
}

export function mapBulkDeleteResult(
  dto: BulkDeleteResultDto | undefined,
): BulkDeleteResult {
  return {
    deleted: mapItems(dto?.deleted),
    failed: mapItems(dto?.failed),
  };
}

// A selection can span projects, and each project is one request; the inbox
// merges the per-project answers into the single summary the bar/toast shows.
export function mergeBulkApproveResults(
  results: readonly BulkApproveResult[],
): BulkApproveResult {
  return results.reduce<BulkApproveResult>(
    (merged, result) => ({
      approved: [...merged.approved, ...result.approved],
      pending: [...merged.pending, ...result.pending],
      failed: [...merged.failed, ...result.failed],
    }),
    { approved: [], pending: [], failed: [] },
  );
}
