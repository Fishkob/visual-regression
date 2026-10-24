import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { normalizeBranchName } from '@public/visualTest/core/domain/value-objects/branch-name.vo';

/**
 * The HTTP face of the Branch.name invariant: the domain owns the rule, this
 * pipe only turns it into a 400. It also rejects a repeated query parameter
 * (`?branch=a&branch=b`), which no DTO can catch because a DTO sees the raw
 * express value.
 *
 * It receives the WHOLE query object (see BranchQuery), not just `branch`: the
 * global ValidationPipe runs before this pipe and String()-coerces a
 * single-property query parameter, so `['a', 'b']` would already have become
 * `'a,b'` — indistinguishable from one (valid) branch name. Reading the raw
 * object keeps the array visible.
 */
@Injectable()
export class BranchNameValidationPipe implements PipeTransform<unknown> {
  transform(value: unknown): string | undefined {
    const branch = branchFromQuery(value);
    if (Array.isArray(branch)) {
      throw new BadRequestException('"branch" must be supplied at most once');
    }
    // Optional query parameter: an absent (or explicitly empty) branch means
    // "the project's default branch".
    if (branch === undefined || branch === null || branch === '') {
      // An explicitly empty branch means "the default branch"; an absent one too.
      return branch === '' ? '' : undefined;
    }
    if (typeof branch !== 'string') {
      throw new BadRequestException('"branch" must be a string');
    }
    try {
      return normalizeBranchName(branch);
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

// `@BranchQuery()` binds the whole query object; direct calls (unit tests, a
// caller holding the plain value) keep working.
function branchFromQuery(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return (value as Record<string, unknown>).branch;
  }
  return value;
}
