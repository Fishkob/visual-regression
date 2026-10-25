import type { ApprovalDto } from "@sdk";
import type { Approval } from "./approval.model";

// The endpoint marks the provenance fields optional AND nullable (`?: T | null`)
// because an approval may not have named a branch or a baseline, and a PDF
// approval carries no pixel count. Narrowing both spellings to one absent value
// keeps the badge free of null checks that would just mean "same as missing".
function present<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function mapApproval(dto: ApprovalDto): Approval {
  return {
    id: dto.id,
    approvedBy: dto.approvedBy,
    approvedAt: new Date(dto.approvedAt),
    comparisonId: dto.comparisonId,
    testKind: dto.testKind,
    ...(present(dto.branchName) ? { branchName: dto.branchName } : {}),
    variant: {
      viewport: dto.variant.viewport,
      browser: dto.variant.browser,
      environment: dto.variant.environment,
    },
    candidateHash: dto.candidateHash,
    ...(present(dto.baselineHash) ? { baselineHash: dto.baselineHash } : {}),
    ...(present(dto.mismatchPixelCount)
      ? { mismatchPixelCount: dto.mismatchPixelCount }
      : {}),
    ...(present(dto.mismatchPageCount)
      ? { mismatchPageCount: dto.mismatchPageCount }
      : {}),
    ...(present(dto.pageCount) ? { pageCount: dto.pageCount } : {}),
  };
}

// The endpoint returns the newest 20 approvals first, so the array order is the
// wire order: mapping preserves it and the badge reads [0] as "the newest".
export function mapApprovals(
  dtos: ApprovalDto[] | null | undefined,
): Approval[] {
  return (dtos ?? []).map(mapApproval);
}
