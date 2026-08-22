import { BadRequestException } from '@nestjs/common';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';

describe('ProjectNameValidationPipe', () => {
  const pipe = new ProjectNameValidationPipe();

  it('should accept valid alphanumeric names', () => {
    expect(pipe.transform('mytest')).toBe('mytest');
    expect(pipe.transform('checkout-ui')).toBe('checkout-ui');
  });

  it('should reject a project named pending (reserved for the aggregate route)', () => {
    expect(() => pipe.transform('pending')).toThrow(BadRequestException);
    expect(() => pipe.transform('pending')).toThrow('reserved');
  });

  it('should reject names longer than 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(() => pipe.transform(longName)).toThrow(BadRequestException);
  });
});
