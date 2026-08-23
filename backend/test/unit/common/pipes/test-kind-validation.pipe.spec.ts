import { BadRequestException } from '@nestjs/common';
import { TestKindValidationPipe } from '@common/http/pipes/test-kind-validation.pipe';

describe('TestKindValidationPipe', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const pipe = new TestKindValidationPipe();

  it('accepts image', () => {
    expect(pipe.transform('image')).toBe('image');
  });

  it('accepts pdf', () => {
    expect(pipe.transform('pdf')).toBe('pdf');
  });

  it('rejects an unknown kind', () => {
    expect(() => pipe.transform('video')).toThrow(BadRequestException);
  });

  it('rejects an empty string', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });

  it('rejects undefined (missing query param)', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
