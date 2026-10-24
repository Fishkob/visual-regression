import { BadRequestException } from '@nestjs/common';
import { BranchNameValidationPipe } from '@common/http/pipes/branch-name-validation.pipe';

describe('BranchNameValidationPipe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const pipe = new BranchNameValidationPipe();

  it('accepts git-style branch names', () => {
    expect(pipe.transform('feature/checkout-v2')).toBe('feature/checkout-v2');
    expect(pipe.transform('release/1.2.3')).toBe('release/1.2.3');
    expect(pipe.transform('main')).toBe('main');
  });

  it('trims surrounding whitespace', () => {
    expect(pipe.transform('  feature/x  ')).toBe('feature/x');
  });

  it('passes an absent branch through so it resolves to the default', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
    expect(pipe.transform('')).toBe('');
  });

  it('rejects empty names', () => {
    expect(() => pipe.transform('   ')).toThrow(BadRequestException);
  });

  it('rejects control characters', () => {
    expect(() => pipe.transform('feature/\u0000x')).toThrow(
      BadRequestException,
    );
  });

  it('rejects names over 255 characters', () => {
    expect(() => pipe.transform('a'.repeat(256))).toThrow(BadRequestException);
  });

  // Express parses a repeated query parameter into an array; `.trim()` on it used
  // to surface as a 500.
  it('rejects a repeated parameter instead of crashing on it', () => {
    expect(() => pipe.transform(['main', 'feature/x'])).toThrow(
      BadRequestException,
    );
  });

  // @BranchQuery binds the whole query object so the global ValidationPipe
  // cannot String()-coerce the repeated value into "main,feature/x" first.
  it('reads branch out of the whole query object', () => {
    expect(pipe.transform({ branch: 'feature/x', foo: 'bar' })).toBe(
      'feature/x',
    );
    expect(pipe.transform({})).toBeUndefined();
  });

  it('rejects a repeated parameter inside the query object', () => {
    expect(() => pipe.transform({ branch: ['main', 'feature/x'] })).toThrow(
      BadRequestException,
    );
  });
});
