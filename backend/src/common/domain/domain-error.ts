// The codes exist as a runtime const so their type can be derived from the
// values (typeof DOMAIN_ERROR_CODES)[number]; the const itself has no other
// runtime consumer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DOMAIN_ERROR_CODES = [
  'BAD_REQUEST',
  'CONFLICT',
  'E_UNIQUE_CONSTRAINT',
  'FORBIDDEN',
  'INTERNAL_ERROR',
  'INVALID_STATE',
  'NOT_FOUND',
  'QUOTA_EXCEEDED',
  'SIDECAR_ERROR',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

// A reason refines a coarse code for the failures a client can act on
// differently: refresh the review, approve on the parent branch, retarget the
// branch. It is deliberately not one code per message — the throw sites
// outnumber the values a client can act on by two orders of magnitude, and a
// value nobody switches on is a value that rots. The list is published as an
// OpenAPI enum (ErrorResponseDto), which is what makes it usable from the
// generated SDK instead of by parsing `message`.
export const DOMAIN_ERROR_REASONS = [
  'branch_archived',
  'branch_target_conflict',
  'comparison_not_pending',
  'comparison_superseded',
  'test_inherited',
] as const;

export type DomainErrorReason = (typeof DOMAIN_ERROR_REASONS)[number];

export class DomainError extends Error {
  readonly code?: DomainErrorCode;
  readonly reason?: DomainErrorReason;

  constructor(
    message: string,
    code?: DomainErrorCode,
    reason?: DomainErrorReason,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.reason = reason;
  }
}
