import type { PendingReviewDto } from "@sdk";
import { isTestKind, type TestKind } from "@/domains/test-kind";
import type { ReviewInboxItem } from "./review-inbox.model";

function toKind(kind: string | undefined): TestKind | undefined {
  return isTestKind(kind) ? kind : undefined;
}

export function mapReviewInboxItem(dto: PendingReviewDto): ReviewInboxItem {
  return {
    comparisonId: dto.comparisonId,
    projectName: dto.projectName,
    groupId: dto.groupId ?? null,
    groupName: dto.groupName ?? null,
    testName: dto.testName,
    kind: toKind(dto.kind),
    ...(dto.variant ?? {}),
    mismatchPixelCount: dto.mismatchPixelCount,
    mismatchPageCount: dto.mismatchPageCount ?? null,
    createdAt: dto.createdAt,
  };
}

export function mapReviewInbox(
  dtos: PendingReviewDto[] | undefined = [],
): ReviewInboxItem[] {
  return dtos.map(mapReviewInboxItem);
}
