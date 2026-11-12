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

// The window the server returns per page. A full page is also the only "there
// may be older comments" signal the array response carries, so the panel and
// the read share this number (the server's `COMMENT_PAGE_SIZE` is its twin).
export const COMMENT_PAGE_SIZE = 200;
