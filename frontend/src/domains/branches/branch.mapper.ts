import type { BranchSummaryDto } from "@sdk";
import type { ProjectBranch } from "./branch.model";

export function mapBranch(dto: BranchSummaryDto): ProjectBranch {
  return {
    name: dto.name,
    isDefault: dto.isDefault,
    isArchived: dto.isArchived,
    targetBranchName: dto.targetBranchName ?? null,
    testCount: dto.testCount,
    pendingCount: dto.pendingCount,
    createdAt: dto.createdAt,
  };
}

export function mapBranches(
  dtos: BranchSummaryDto[] | undefined = [],
): ProjectBranch[] {
  return dtos.map(mapBranch);
}
