import { describe, it, expect } from 'vitest';
import { decideOutcome } from '@public/visualTest/core/domain/policies/upload-decision-policy';

describe('decideOutcome', () => {
  it('returns baseline_created when no baseline exists', () => {
    const result = decideOutcome('test-1', 'hash-1', null);
    expect(result).toEqual({
      status: 'baseline_created',
      testId: 'test-1',
      contentHash: 'hash-1',
    });
  });

  it('returns identical when image hashes match', () => {
    const result = decideOutcome('test-1', 'same-hash', {
      id: 'base-1',
      contentHash: 'same-hash',
      fileUrl: 'http://storage/baseline.png',
    });
    expect(result).toEqual({
      status: 'identical',
      testId: 'test-1',
    });
  });

  it('returns comparison_queued when hashes differ', () => {
    const result = decideOutcome('test-1', 'new-hash', {
      id: 'base-1',
      contentHash: 'old-hash',
      fileUrl: 'http://storage/baseline.png',
    });
    expect(result).toEqual({
      status: 'comparison_queued',
      testId: 'test-1',
      baseline: {
        id: 'base-1',
        contentHash: 'old-hash',
        fileUrl: 'http://storage/baseline.png',
      },
      contentHash: 'new-hash',
    });
  });

  it('keeps the business threshold out of the comparison_queued result', () => {
    const result = decideOutcome('test-2', 'hash-b', {
      id: 'base-2',
      contentHash: 'hash-a',
      fileUrl: 'http://storage/b.png',
    });
    expect(result).toMatchObject({ status: 'comparison_queued' });
    expect(
      'pixelDiffThreshold' in (result as { baseline: object }).baseline,
    ).toBe(false);
  });
});
