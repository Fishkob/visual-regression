import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createVrt, toTestName } from '../playwright-capture';
import { uploadMany } from '../upload-many';

// Keep the pure config helpers real; only the network call is mocked.
vi.mock('../upload-many', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../upload-many')>();
  return { ...actual, uploadMany: vi.fn() };
});

const uploadManyMock = vi.mocked(uploadMany);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PDF = new TextEncoder().encode('%PDF-1.7');

function testInfo(title = 'login works') {
  return { title, titlePath: ['checkout.spec.ts', title] };
}

function pageOf(bytes: Uint8Array) {
  const calls: Array<{ fullPage?: boolean } | undefined> = [];
  const page = {
    async screenshot(options?: { fullPage?: boolean }) {
      calls.push(options);
      return bytes;
    },
  };
  return { page, calls };
}

function client() {
  return createVrt({
    apiUrl: 'http://vrt.test/api/v1',
    apiKey: 'key-1',
    project: 'checkout',
    runKey: 'ci-1',
    environment: 'staging',
  });
}

describe('createVrt', () => {
  beforeEach(() => {
    uploadManyMock.mockReset();
    uploadManyMock.mockResolvedValue([
      {
        index: 0,
        capture: {} as never,
        ok: true,
        attempts: 1,
        data: {},
      },
    ]);
  });

  it('captures a page under the test title path', async () => {
    const { page, calls } = pageOf(PNG);

    const result = await client().capture(testInfo(), page);

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ fullPage: true }]);
    const [captures, options] = uploadManyMock.mock.calls[0]!;
    expect(options).toEqual(
      expect.objectContaining({
        apiKey: 'key-1',
        baseUrl: 'http://vrt.test/api/v1',
      }),
    );
    expect(captures[0]).toEqual(
      expect.objectContaining({
        projectName: 'checkout',
        // "checkout.spec.ts / login works" is not a name the API accepts.
        testName: 'checkout-spec-ts-login-works',
        environment: 'staging',
        runKey: 'ci-1',
        kind: 'image',
      }),
    );
    expect(captures[0]!.file).toBeInstanceOf(Blob);
    expect((captures[0]!.file as Blob).size).toBe(PNG.length);
  });

  it('captures the viewport when fullPage is false', async () => {
    const { page, calls } = pageOf(PNG);

    await client().capture(testInfo(), page, { fullPage: false });

    expect(calls).toEqual([{ fullPage: false }]);
  });

  it('accepts a buffer and recognises a PDF by its header', async () => {
    const result = await client().capture(testInfo(), PDF);

    expect(result.ok).toBe(true);
    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]).toEqual(
      expect.objectContaining({ kind: 'pdf', testName: 'checkout-spec-ts-login-works' }),
    );
    expect((captures[0]!.file as Blob).type).toBe('application/pdf');
  });

  it('uploads a Blob as it is', async () => {
    const blob = new Blob([PDF], { type: 'application/pdf' });

    await client().capture(testInfo(), blob);

    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]!.kind).toBe('pdf');
    expect(captures[0]!.file).toBe(blob);
  });

  it('lets an explicit kind override the detected one', async () => {
    await client().capture(testInfo(), PNG, { kind: 'pdf' });

    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]!.kind).toBe('pdf');
    expect((captures[0]!.file as Blob).type).toBe('application/pdf');
  });

  it('returns a failed upload instead of throwing', async () => {
    uploadManyMock.mockResolvedValue([
      {
        index: 0,
        capture: {} as never,
        ok: false,
        attempts: 3,
        error: 'boom',
      },
    ]);
    const onUpload = vi.fn();

    const result = await createVrt({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      onUpload,
    }).capture(testInfo(), PNG);

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(onUpload).toHaveBeenCalledWith(result);
  });
});

describe('test names', () => {
  it('reduces a title path to a name the API accepts', () => {
    expect(toTestName(testInfo())).toBe('checkout-spec-ts-login-works');
  });

  it('accepts the title path as a function, like a Playwright Test', () => {
    expect(
      toTestName({ title: 'login works', titlePath: () => ['checkout.spec.ts', 'login works'] }),
    ).toBe('checkout-spec-ts-login-works');
  });

  it('keeps a title that is already a valid name', () => {
    expect(toTestName({ title: 'login-form', titlePath: ['login-form'] })).toBe(
      'login-form',
    );
  });

  it('never exceeds the API limit and keeps colliding prefixes apart', () => {
    const head = 'a'.repeat(140);
    const first = toTestName({ title: 'x', titlePath: [head, 'first case'] });
    const second = toTestName({ title: 'x', titlePath: [head, 'second case'] });

    expect(first.length).toBeLessThanOrEqual(100);
    expect(second.length).toBeLessThanOrEqual(100);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^a+-[0-9a-f]{8}$/);
  });

  it('falls back to a hashed name when nothing survives', () => {
    const name = toTestName({ title: '!!!', titlePath: ['!!!'] });

    expect(name).toMatch(/^test-[0-9a-f]{8}$/);
    expect(name).toBe(toTestName({ title: '!!!', titlePath: ['!!!'] }));
  });
});

describe('config thresholds', () => {
  beforeEach(() => {
    uploadManyMock.mockReset();
    uploadManyMock.mockResolvedValue([
      {
        index: 0,
        capture: {} as never,
        ok: true,
        attempts: 1,
        data: {},
      },
    ]);
  });

  it('applies the threshold from the repository config', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'vrt-config-'));
    const configPath = join(dir, '.vrt.json');
    await writeFile(
      configPath,
      JSON.stringify({
        thresholds: { 'checkout.spec.ts / login works': 7 },
      }),
    );

    await createVrt({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      configPath,
    }).capture(testInfo(), PNG);

    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]!.pixelDiffThreshold).toBe(7);
  });

  it('lets the capture override the configured threshold', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'vrt-config-'));
    const configPath = join(dir, '.vrt.json');
    await writeFile(configPath, JSON.stringify({ thresholds: { 'login works': 7 } }));

    await createVrt({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      configPath,
    }).capture(testInfo(), PNG, { pixelDiffThreshold: 11 });

    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]!.pixelDiffThreshold).toBe(11);
  });

  it('uploads without a threshold when the config file is missing', async () => {
    await createVrt({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      configPath: '/nonexistent/vrt/.vrt.json',
    }).capture(testInfo(), PNG);

    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]!.pixelDiffThreshold).toBeUndefined();
  });

  it('reports a broken config instead of silently dropping the capture', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'vrt-config-'));
    const configPath = join(dir, '.vrt.json');
    await writeFile(configPath, '{not json');
    const onConfigError = vi.fn();

    await createVrt({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      configPath,
      onConfigError,
    }).capture(testInfo(), PNG);

    expect(onConfigError).toHaveBeenCalledTimes(1);
    expect(uploadManyMock).toHaveBeenCalledTimes(1);
  });
});
