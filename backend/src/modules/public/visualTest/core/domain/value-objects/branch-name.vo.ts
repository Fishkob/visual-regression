import { DomainError } from '@common/domain/domain-error';
import { MAX_BRANCH_NAME_LENGTH } from '@public/visualTest/core/domain/constants/branch.constants';

// eslint-disable-next-line no-control-regex -- the check is exactly for control characters
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Single owner of the `Branch.name` invariant: trimmed, non-empty, at most
 * MAX_BRANCH_NAME_LENGTH characters and free of control characters.
 *
 * Every path that creates or looks a branch up by name runs through it (upload,
 * retarget, promote, and the HTTP pipe), so a name that can be created is always
 * a name that can be read back through `?branch=`. `undefined`/`null`/`''` mean
 * "not specified" and resolve to the caller's default.
 */
export function normalizeBranchName(
  raw: string | null | undefined,
): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const name = raw.trim();
  if (name.length === 0) {
    throw new DomainError('Branch name must not be empty', 'BAD_REQUEST');
  }
  if (name.length > MAX_BRANCH_NAME_LENGTH) {
    throw new DomainError(
      `Branch name too long (max ${MAX_BRANCH_NAME_LENGTH} characters)`,
      'BAD_REQUEST',
    );
  }
  if (CONTROL_CHARS.test(name)) {
    throw new DomainError(
      'Branch name contains control characters',
      'BAD_REQUEST',
    );
  }
  return name;
}
