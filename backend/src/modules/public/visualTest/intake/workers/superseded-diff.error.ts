import { DomainError } from '@common/domain/domain-error';

export class SupersededDiffError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_STATE');
    this.name = 'SupersededDiffError';
  }
}
