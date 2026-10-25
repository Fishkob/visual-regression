export interface ReviewComment {
  id: string;
  projectName: string;
  branchName: string | null;
  testId: string;
  comparisonId: string | null;
  body: string;
  authorId: string | null;
  author: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface CreateReviewCommentInput {
  body: string;
  comparisonId?: string;
  branch?: string;
}

export const COMMENT_MAX_LENGTH = 4000;
