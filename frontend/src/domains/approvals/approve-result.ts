// The generated ApproveResultDto predates 4-eyes voting: a project with
// requiredApprovals > 1 answers the pending-vote shape instead. Both are 200
// responses, so this is a discriminated read of the same payload rather than an
// error path.
export type ApproveResultSource =
  | {
      approved?: boolean;
      requiresMoreApprovals?: boolean;
      votes?: number;
      required?: number;
      newBaselineUrl?: string;
      signedNewBaselineUrl?: string;
    }
  | null
  | undefined;

export interface PendingVotes {
  votes: number;
  required: number;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function pendingVotesOf(result: unknown): PendingVotes | null {
  if (typeof result !== "object" || result === null) return null;
  const source = result as {
    approved?: unknown;
    requiresMoreApprovals?: unknown;
    votes?: unknown;
    required?: unknown;
  };
  if (source.requiresMoreApprovals === true || source.approved === false) {
    return { votes: count(source.votes), required: count(source.required) };
  }
  return null;
}
