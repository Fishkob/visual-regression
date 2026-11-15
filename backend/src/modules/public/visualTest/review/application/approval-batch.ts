import { DomainError } from '@common/domain/domain-error';
import type { TestKind } from '@common/domain/test-kind';

// Upper bound for one "approve many" request. It mirrors the bulk-endpoint cap
// (BULK_LIMIT in the presentation layer) and the run approve-all, so every
// caller asks for the same amount of work per HTTP request: each approval is
// its own serial transaction (audit row, webhook outbox, status recompute), and
// a request that carries more than this outlives the proxy's read timeout.
export const APPROVE_ALL_MAX = 100;

// One comparison a batch should approve, with the owning test already resolved
// by the caller. Carrying the kind lets the batch dispatch without a second
// lookup, and it is the caller's own row, so a stale kind can only mean the test
// was re-kinded mid-batch — which the in-transaction resolution rejects.
export interface ApproveTarget {
  comparisonId: string;
  testName: string;
  kind: TestKind;
  branchName?: string;
}

export interface BatchFailure {
  comparisonId: string;
  error: string;
}

// A caller whose response is a summary: "how many were approved".
export interface CountedApprovalBatch {
  approved: number;
  failed: BatchFailure[];
}

// A caller whose response lists the selection it sent.
export interface ListedApprovalBatch {
  approved: { id: string; success: true }[];
  failed: { id: string; success: false; error: string }[];
}

// The batch's outcome, and the only place its shape is decided. Every
// "approve many" call site — a run's approve-all, the test's pending list, a
// cross-test bulk selection — projects this one result; before, each declared
// its own near-identical shape (two of them under the same exported name) and
// re-wrote the failure policy next to it. It lives beside the service rather
// than inside it so a caller that only projects a batch does not import the
// approval pipeline (and its twelve collaborators) to name the result.
export class ApprovalBatch {
  constructor(
    readonly approved: string[],
    readonly failed: BatchFailure[],
  ) {}

  // The summary projection: a run reports a count.
  counts(): CountedApprovalBatch {
    return {
      approved: this.approved.length,
      failed: this.failed,
    };
  }

  // The listing projection: a bulk selection reports one row per comparison.
  rows(): ListedApprovalBatch {
    return {
      approved: this.approved.map((id) => ({ id, success: true })),
      failed: this.failed.map((failure) => ({
        id: failure.comparisonId,
        success: false,
        error: failure.error,
      })),
    };
  }
}

// A DomainError's message is written for the client and safe to return; any
// other error is an internal failure whose text could leak implementation
// detail, so a batch reports the operation's generic message instead. The
// policy is one function because the bulk delete/move loops had re-spelled it —
// one of them without the guard, so internal text reached the browser. Only the
// noun differs per operation, so the caller supplies it.
export function bulkFailureMessage(error: unknown, fallback: string): string {
  return error instanceof DomainError ? error.message : fallback;
}
