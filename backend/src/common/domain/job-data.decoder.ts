import { DomainError } from '@common/domain/domain-error';
import type { JobData } from '@common/domain/job-data.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// The job payload is written by this codebase (PostgresJobQueue.enqueue), so
// the decode only guards the shape a legacy or corrupt row could break: the
// envelope, the discriminated testKind, and the nested string fields the
// worker reads. A single error message keeps the fail-fast behavior without
// per-field ceremony.
export function decodeJobData(value: unknown): JobData {
  if (!isRecord(value)) {
    throw new DomainError(
      'Malformed job data: expected an object',
      'INVALID_STATE',
    );
  }
  if (value.testKind !== 'image' && value.testKind !== 'pdf') {
    throw new DomainError(
      `Malformed job data: unknown testKind "${String(value.testKind)}"`,
      'INVALID_STATE',
    );
  }
  if (
    typeof value.testId !== 'string' ||
    typeof value.projectName !== 'string' ||
    typeof value.candidateHash !== 'string' ||
    !isRecord(value.baseline) ||
    typeof value.baseline.id !== 'string' ||
    typeof value.baseline.url !== 'string' ||
    !isRecord(value.candidate) ||
    typeof value.candidate.id !== 'string' ||
    typeof value.candidate.url !== 'string' ||
    !isRecord(value.variant) ||
    typeof value.variant.viewport !== 'string' ||
    typeof value.variant.browser !== 'string' ||
    typeof value.variant.environment !== 'string' ||
    (value.traceContext !== undefined &&
      (!isRecord(value.traceContext) ||
        Object.values(value.traceContext).some((v) => typeof v !== 'string')))
  ) {
    throw new DomainError(
      'Malformed job data: missing or mistyped fields',
      'INVALID_STATE',
    );
  }
  return value as unknown as JobData;
}
