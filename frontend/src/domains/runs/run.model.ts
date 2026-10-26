import type { TestKind } from "@/domains/test-kind";

// The four states the backend derives from the linked jobs/comparisons. The
// wire carries a plain string, so every consumer crosses presentRunState in the
// mapper instead of trusting the literal.
export const RUN_STATES = ["open", "pending", "failed", "passed"] as const;

export type RunState = (typeof RUN_STATES)[number];

export const RUN_STATE_LABEL: Record<RunState, string> = {
  open: "Open",
  pending: "Pending",
  failed: "Failed",
  passed: "Passed",
};

// The state badge reuses the shared badge variants: passed is the primary
// (green-ish) success variant, failed the destructive one, and the two
// in-progress states stay quiet so a list of open runs is not a wall of color.
export const RUN_STATE_BADGE_VARIANT: Record<
  RunState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "outline",
  pending: "secondary",
  failed: "destructive",
  passed: "default",
};

// An open/pending run still collects uploads and review work; passed and failed
// are terminal, which is also the rule that stops the detail page polling. An
// unknown state (still loading) is not live yet.
export function isRunLive(state: RunState | undefined): boolean {
  return state === "open" || state === "pending";
}

export interface Run {
  id: string;
  key: string;
  branchName: string;
  commitSha: string | null;
  commitMessage: string | null;
  ciUrl: string | null;
  createdAt: string;
  lastActivityAt: string;
  finishedAt: string | null;
  finishedBy: string | null;
}

// The maintenance task closes idle runs as "auto"; a person's name is the actor
// when someone pressed Finish. A still-open run has no finisher at all.
export function runFinishedLabel(
  run: Pick<Run, "finishedAt" | "finishedBy">,
): string {
  if (!run.finishedAt) return "—";
  return run.finishedBy ?? "—";
}

// The short SHA is what reviewers scan for; the full value stays in the title.
export function shortCommitSha(sha: string | null): string {
  if (!sha) return "—";
  return sha.slice(0, 7);
}

export interface RunStatus {
  state: RunState;
  pendingComparisons: number;
  mutedPending: number;
  pendingJobs: number;
  failedJobs: number;
  approved: number;
  testCount: number;
}

export interface RunPending {
  comparisonId: string;
  testName: string;
  kind?: TestKind;
  branchName: string;
  viewport?: string;
  browser?: string;
  environment?: string;
  mismatchPixelCount: number;
  mismatchPageCount: number | null;
  // The test is muted, so this row does not hold the run gate and "approve all"
  // deliberately leaves it pending.
  muted: boolean;
  createdAt: string;
}

export interface RunApproval {
  comparisonId: string;
  testName: string;
  approvedBy: string;
  approvedAt: string;
}

export interface RunFailedJob {
  id: string;
  testName: string;
  branchName: string;
  error: string;
  createdAt: string;
}

export interface RunDetail {
  run: Run;
  status: RunStatus;
  pending: RunPending[];
  approvals: RunApproval[];
  failedJobs: RunFailedJob[];
}

export interface RunApproveAllFailure {
  comparisonId: string;
  error: string;
}

export interface RunApproveAllPending {
  comparisonId: string;
  votes: number;
  required: number;
}

export interface RunApproveAllResult {
  approved: number;
  pending: RunApproveAllPending[];
  failed: RunApproveAllFailure[];
}

// The list endpoint pages by page/limit, not skip/take, so the query mirrors it.
export interface RunListQuery {
  branch?: string;
  page?: number;
  limit?: number;
}

export interface RunPage {
  items: Run[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
