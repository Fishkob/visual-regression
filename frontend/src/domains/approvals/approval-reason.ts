export const APPROVAL_REASONS = ["INTENDED_CHANGE", "FLAKE", "INFRA"] as const;

export type ApprovalReason = (typeof APPROVAL_REASONS)[number];

export const APPROVAL_NOTE_MAX_LENGTH = 2000;

export interface ApprovalDecision {
  reason?: ApprovalReason;
  note?: string;
}

export function isApprovalReason(value: unknown): value is ApprovalReason {
  return APPROVAL_REASONS.some((reason) => reason === value);
}

export function approvalReasonKey(reason: ApprovalReason): string {
  return `approval.reason.${reason}`;
}
