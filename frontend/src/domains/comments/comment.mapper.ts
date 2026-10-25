import type { CommentDto } from "@sdk";
import type { ReviewComment } from "./comment.model";

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function mapComment(dto: CommentDto): ReviewComment {
  return {
    id: dto.id ?? "",
    projectName: dto.projectName ?? "",
    branchName: text(dto.branchName),
    testId: dto.testId ?? "",
    comparisonId: text(dto.comparisonId),
    body: dto.body ?? "",
    authorId: text(dto.authorId),
    author: dto.author ?? "",
    createdAt: text(dto.createdAt) ?? "",
    resolvedAt: text(dto.resolvedAt),
    resolvedBy: text(dto.resolvedBy),
  };
}

export function mapComments(
  dtos: CommentDto[] | null | undefined,
): ReviewComment[] {
  return (dtos ?? []).map(mapComment);
}
