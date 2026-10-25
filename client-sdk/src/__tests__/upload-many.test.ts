import { describe, expect, it, vi, afterEach } from 'vitest';
import { createClient, createConfig } from '../../client';
import { uploadMany, type CaptureUpload } from '../upload-many';

function capture(testName: string, overrides: Partial<CaptureUpload> = {}): CaptureUpload {
  return {
    projectName: 'checkout',
    testName,
    file: new Blob(['png'], { type: 'image/png' }),
    viewport: '1920x1080',
    browser: 'chromium',
    environment: 'staging',
    runKey: 'ci-1',
    ...overrides,
  };
}

function client() {
  return createClient(
    createConfig({
      baseUrl: 'http://vrt.test/api/v1',
      headers: { 'x-api-key': 'key-1' },
    }),
  );
}

function ok(body: unknown = { status: 'identical', mismatchPixelCount: 0, branch: 'main' }) {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}

describe('uploadMany', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uploads every capture and keeps the input order', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);

    const results = await uploadMany(
      [capture('a'), capture('b'), capture('c')],
      { apiKey: 'key-1', baseUrl: 'http://vrt.test/api/v1', concurrency: 2, client: client() },
    );

    expect(results.map((result) => result.capture.testName)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const request = fetchMock.mock.calls[0]![0] as Request;
    expect(request.url).toContain('/projects/checkout/tests/');
    expect(request.url).toContain('testKind=image');
    expect(request.headers.get('x-api-key')).toBe('key-1');
    const body = await request.formData();
    expect(body.get('runKey')).toBe('ci-1');
  });

  it('bounds concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return ok();
    });
    vi.stubGlobal('fetch', fetchMock);

    const captures = Array.from({ length: 6 }, (_, index) =>
      capture(`t-${index}`),
    );
    await uploadMany(captures, {
      apiKey: 'key-1',
      baseUrl: 'http://vrt.test/api/v1',
      concurrency: 2,
      client: client(),
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('retries a 429 and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('busy', { status: 429, headers: { 'retry-after': '0' } }),
      )
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);

    const [result] = await uploadMany([capture('a')], {
      apiKey: 'key-1',
      baseUrl: 'http://vrt.test/api/v1',
      retryDelayMs: 0,
      maxAttempts: 3,
      client: client(),
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'bad viewport' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [result] = await uploadMany([capture('a')], {
      apiKey: 'key-1',
      baseUrl: 'http://vrt.test/api/v1',
      maxAttempts: 3,
      client: client(),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports progress and returns an empty result for no captures', async () => {
    const onProgress = vi.fn();
    await expect(
      uploadMany([], { apiKey: 'key-1', onProgress, client: client() }),
    ).resolves.toEqual([]);
    expect(onProgress).not.toHaveBeenCalled();
  });
});
