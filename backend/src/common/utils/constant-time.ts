import { createHash, timingSafeEqual } from 'node:crypto';

// Comparing a static operator key with `===` stops at the first differing byte,
// which leaks the matching prefix and, in practice, lets a caller recover the
// key byte by byte from response timing. Hashing both sides first makes the
// comparison fixed-size, so it cannot tell the caller anything about the input.
export function equalsConstantTime(
  provided: string,
  expected: string,
): boolean {
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}
