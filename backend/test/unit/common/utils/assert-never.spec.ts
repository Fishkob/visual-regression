import { assertNever } from '@common/utils/assert-never';

describe('assertNever', () => {
  it('throws with the default message and the offending value', () => {
    expect(() => assertNever('unexpected' as never)).toThrow(
      'Unhandled exhaustive switch case: "unexpected"',
    );
  });

  it('uses a custom message when provided', () => {
    expect(() => assertNever('x' as never, 'boom')).toThrow('boom');
  });
});
