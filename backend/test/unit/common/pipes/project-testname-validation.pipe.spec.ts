import { BadRequestException } from '@nestjs/common';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';

describe('ProjectTestNameValidationPipe', () => {
  const pipe = new ProjectTestNameValidationPipe();

  it('should accept valid alphanumeric names', () => {
    expect(pipe.transform('mytest')).toBe('mytest');
    expect(pipe.transform('Test123')).toBe('Test123');
  });

  it('should accept names with hyphens', () => {
    expect(pipe.transform('my-test')).toBe('my-test');
  });

  it('should accept names with underscores', () => {
    expect(pipe.transform('my_test')).toBe('my_test');
    expect(pipe.transform('test_123')).toBe('test_123');
  });

  it('should reject empty or falsy names', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
    expect(() => pipe.transform('')).toThrow('Only letters, numbers');
  });

  it('should reject names longer than 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(() => pipe.transform(longName)).toThrow(BadRequestException);
    expect(() => pipe.transform(longName)).toThrow('too long');
  });

  it('should accept names with exactly 100 characters', () => {
    const exactName = 'a'.repeat(100);
    expect(pipe.transform(exactName)).toBe(exactName);
  });

  it('should reject names with spaces', () => {
    expect(() => pipe.transform('my test')).toThrow(BadRequestException);
    expect(() => pipe.transform('my test')).toThrow(
      'Only letters, numbers, hyphens and underscores',
    );
  });

  it('should reject names with special characters', () => {
    expect(() => pipe.transform('my/test')).toThrow(BadRequestException);
    expect(() => pipe.transform('my.project')).toThrow(BadRequestException);
  });
});
