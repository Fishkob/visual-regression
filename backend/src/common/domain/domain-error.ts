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
  'SIDECAR_ERROR',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code?: DomainErrorCode;

  constructor(message: string, code?: DomainErrorCode) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
