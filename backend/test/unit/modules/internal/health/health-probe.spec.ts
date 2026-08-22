import { describe, expect, it } from 'vitest';
import { probe, probeHealthUrl } from '@internal/health/health-probe';

describe('probe', () => {
  it('returns ok with elapsedMs and value when fn resolves', async () => {
    const result = await probe(async () => 42);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns error with normalized message when fn rejects with Error', async () => {
    const result = await probe(async () => {
      throw new Error('Connection refused');
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Connection refused');
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns Unknown error for non-Error rejects', async () => {
    const result = await probe(async () => {
      throw 'string error';
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Unknown error');
    }
  });

  it('times out a hung probe and reports not-ok', async () => {
    const result = await probe(
      () =>
        new Promise(() => {
          // never resolves
        }),
      { timeoutMs: 50 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('timed out');
  });

  it('returns the value when the probe completes within the timeout', async () => {
    const result = await probe(async () => 42, { timeoutMs: 100 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('runs without a timeout when none is given', async () => {
    const result = await probe(async () => 'ok');
    expect(result.ok).toBe(true);
  });

  it('clears the timeout timer once the work wins the race', async () => {
    vi.useFakeTimers();
    try {
      const resultPromise = probe(async () => 42, { timeoutMs: 50_000 });
      const result = await resultPromise;
      expect(result.ok).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('probeHealthUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns ok with body for a 200 JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      }),
    );

    const result = await probeHealthUrl('http://worker:3000/health');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual({ status: 'ok' });
    }
  });

  it('returns http-error for a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    const result = await probeHealthUrl('http://worker:3000/health');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(503);
      expect(result.message).toBe('HTTP 503');
    }
  });

  it('returns network error with null httpStatus when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    const result = await probeHealthUrl('http://worker:3000/health');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBeNull();
      expect(result.message).toBe('ECONNREFUSED');
    }
  });
});
