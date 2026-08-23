import { describe, expect, it } from 'vitest';
import { decodeJobData } from '@common/domain/job-data.decoder';
import { DomainError } from '@common/domain/domain-error';

describe('decodeJobData', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('decodes a valid image job payload', () => {
    const data = decodeJobData({
      testKind: 'image',
      testId: 'test-1',
      candidateHash: 'hash-from-upload',
      candidate: { id: 'c1', url: 'http://s/c.png' },
      baseline: { id: 'b1', url: 'http://s/b.png' },
      variant: { viewport: '1', browser: 'b', environment: 'e' },
    });
    expect(data).toEqual({
      testKind: 'image',
      testId: 'test-1',
      candidateHash: 'hash-from-upload',
      candidate: { id: 'c1', url: 'http://s/c.png' },
      baseline: { id: 'b1', url: 'http://s/b.png' },
      variant: { viewport: '1', browser: 'b', environment: 'e' },
    });
  });

  it('decodes a valid pdf job payload', () => {
    const data = decodeJobData({
      testKind: 'pdf',
      testId: 'test-1',
      candidateHash: 'hash-from-upload',
      candidate: { id: 'c1', url: 'http://s/c.pdf' },
      baseline: { id: 'b1', url: 'http://s/b.pdf' },
      variant: { viewport: '1', browser: 'b', environment: 'e' },
    });
    expect(data.testKind).toBe('pdf');
  });

  it('preserves an optional traceContext', () => {
    const data = decodeJobData({
      testKind: 'image',
      testId: 'test-1',
      candidateHash: 'hash-from-upload',
      candidate: { id: 'c1', url: 'u' },
      baseline: { id: 'b1', url: 'u' },
      variant: { viewport: '1', browser: 'b', environment: 'e' },
      traceContext: { traceparent: 'tp' },
    });
    expect(data.traceContext).toEqual({ traceparent: 'tp' });
  });

  it('throws INVALID_STATE when traceContext holds a non-string value', () => {
    expect(() =>
      decodeJobData({
        testKind: 'image',
        testId: 'test-1',
        candidateHash: 'hash-from-upload',
        candidate: { id: 'c1', url: 'u' },
        baseline: { id: 'b1', url: 'u' },
        variant: { viewport: '1', browser: 'b', environment: 'e' },
        traceContext: { traceparent: 42 },
      }),
    ).toThrow(DomainError);
    expect(() =>
      decodeJobData({
        testKind: 'image',
        testId: 'test-1',
        candidateHash: 'hash-from-upload',
        candidate: { id: 'c1', url: 'u' },
        baseline: { id: 'b1', url: 'u' },
        variant: { viewport: '1', browser: 'b', environment: 'e' },
        traceContext: 'not-an-object',
      }),
    ).toThrow(DomainError);
  });

  it('throws INVALID_STATE on an unknown testKind', () => {
    expect(() =>
      decodeJobData({
        testKind: 'video',
        testId: 't',
        candidate: {},
        baseline: {},
        variant: {},
      }),
    ).toThrow(DomainError);
  });

  it('throws INVALID_STATE when a required field is missing or mistyped', () => {
    expect(() =>
      decodeJobData({
        testKind: 'image',
        testId: 't',
        candidate: { id: 'c1' },
        baseline: { id: 'b', url: 'u' },
        variant: { viewport: '1', browser: 'b', environment: 'e' },
      }),
    ).toThrow(DomainError);
  });

  it('throws INVALID_STATE when the payload is not an object', () => {
    expect(() => decodeJobData(null)).toThrow(DomainError);
    expect(() => decodeJobData('nope')).toThrow(DomainError);
  });
});
