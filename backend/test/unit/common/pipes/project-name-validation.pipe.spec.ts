import { BadRequestException } from '@nestjs/common';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';

describe('ProjectNameValidationPipe', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const pipe = new ProjectNameValidationPipe();

  it('accepts valid alphanumeric names', () => {
    expect(pipe.transform('mytest')).toBe('mytest');
    expect(pipe.transform('checkout-ui')).toBe('checkout-ui');
  });

  it('rejects a project named pending (reserved for the aggregate route)', () => {
    expect(() => pipe.transform('pending')).toThrow(BadRequestException);
    expect(() => pipe.transform('pending')).toThrow('reserved');
  });

  it('rejects names longer than 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(() => pipe.transform(longName)).toThrow(BadRequestException);
  });
});
