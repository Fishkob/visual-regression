import { BadRequestException } from '@nestjs/common';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';

describe('ProjectTestNameValidationPipe', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const pipe = new ProjectTestNameValidationPipe();

  it('accepts valid alphanumeric names', () => {
    expect(pipe.transform('mytest')).toBe('mytest');
    expect(pipe.transform('Test123')).toBe('Test123');
  });

  it('accepts names with hyphens', () => {
    expect(pipe.transform('my-test')).toBe('my-test');
  });

  it('accepts names with underscores', () => {
    expect(pipe.transform('my_test')).toBe('my_test');
    expect(pipe.transform('test_123')).toBe('test_123');
  });

  it('rejects empty or falsy names', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
    expect(() => pipe.transform('')).toThrow('Only letters, numbers');
  });

  it('rejects names longer than 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(() => pipe.transform(longName)).toThrow(BadRequestException);
    expect(() => pipe.transform(longName)).toThrow('too long');
  });

  it('accepts names with exactly 100 characters', () => {
    const exactName = 'a'.repeat(100);
    expect(pipe.transform(exactName)).toBe(exactName);
  });

  it('rejects names with spaces', () => {
    expect(() => pipe.transform('my test')).toThrow(BadRequestException);
    expect(() => pipe.transform('my test')).toThrow(
      'Only letters, numbers, hyphens and underscores',
    );
  });

  it('rejects names with special characters', () => {
    expect(() => pipe.transform('my/test')).toThrow(BadRequestException);
    expect(() => pipe.transform('my.project')).toThrow(BadRequestException);
  });
});
