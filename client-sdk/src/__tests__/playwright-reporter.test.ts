import { describe, expect, it, vi, beforeEach } from 'vitest';
import VrtReporter, { createVrtReporter, toTestName } from '../playwright-reporter';
import { uploadMany } from '../upload-many';

// Keep the pure config helpers real; only the network call is mocked.
vi.mock('../upload-many', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../upload-many')>();
  return { ...actual, uploadMany: vi.fn() };
});

const uploadManyMock = vi.mocked(uploadMany);

function testLike(title = 'login works') {
  return {
    title,
    titlePath: () => ['checkout.spec.ts', title],
    location: { file: 'checkout.spec.ts' },
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    status: 'passed',
    attachments: [
      {
        name: 'screenshot',
        contentType: 'image/png',
        body: Buffer.from('png'),
      },
    ],
    retry: 0,
    ...overrides,
  };
}

describe('createVrtReporter', () => {
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

  it('uploads the screenshot of a passing test under its title path', async () => {
    const reporter = createVrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      runKey: 'ci-1',
      environment: 'staging',
    });

    reporter.onTestEnd(testLike(), result());
    await reporter.onEnd();

    expect(uploadManyMock).toHaveBeenCalledTimes(1);
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
    expect(reporter.results()).toHaveLength(1);
  });

  it('can restrict uploads to failures and skips retries', async () => {
    const reporter = createVrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      uploadOnFailureOnly: true,
      skipRetries: true,
    });

    reporter.onTestEnd(testLike(), result({ status: 'passed' }));
    reporter.onTestEnd(testLike(), result({ status: 'failed', retry: 1 }));
    await reporter.onEnd();

    expect(uploadManyMock).not.toHaveBeenCalled();
  });

  it('uploads a failed first attempt when retries are included', async () => {
    const reporter = createVrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      uploadOnFailureOnly: true,
    });

    reporter.onTestEnd(testLike(), result({ status: 'failed', retry: 0 }));
    await reporter.onEnd();

    expect(uploadManyMock).toHaveBeenCalledTimes(1);
  });

  it('ignores tests without a screenshot attachment', async () => {
    const reporter = createVrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
    });

    reporter.onTestEnd(testLike(), result({ attachments: [] }));
    await reporter.onEnd();

    expect(uploadManyMock).not.toHaveBeenCalled();
  });
});

describe('test names', () => {
  it('reduces a title path to a name the API accepts', () => {
    expect(toTestName(testLike())).toBe('checkout-spec-ts-login-works');
  });

  it('keeps a title that is already a valid name', () => {
    expect(toTestName({ title: 'login-form', titlePath: () => ['login-form'] })).toBe(
      'login-form',
    );
  });

  it('never exceeds the API limit and keeps colliding prefixes apart', () => {
    const head = 'a'.repeat(140);
    const first = toTestName({
      title: 'x',
      titlePath: () => [head, 'first case'],
    });
    const second = toTestName({
      title: 'x',
      titlePath: () => [head, 'second case'],
    });

    expect(first.length).toBeLessThanOrEqual(100);
    expect(second.length).toBeLessThanOrEqual(100);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^a+-[0-9a-f]{8}$/);
  });

  it('falls back to a hashed name when nothing survives', () => {
    const name = toTestName({ title: '!!!', titlePath: () => ['!!!'] });

    expect(name).toMatch(/^test-[0-9a-f]{8}$/);
    expect(name).toBe(toTestName({ title: '!!!', titlePath: () => ['!!!'] }));
  });
});

describe('default export', () => {
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

  // Playwright resolves a reporter configured by name and calls its default
  // export with `new`; a module without one fails at startup, before a test runs.
  it('is a class Playwright can construct from the config name', async () => {
    const reporter = new VrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
    });

    reporter.onTestEnd(testLike(), result());
    await reporter.onEnd();

    expect(uploadManyMock).toHaveBeenCalledTimes(1);
    expect(reporter.results()).toHaveLength(1);
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

    const reporter = createVrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      configPath,
    });

    reporter.onTestEnd(testLike(), result());
    await reporter.onEnd();

    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]!.pixelDiffThreshold).toBe(7);
  });

  it('also matches a threshold written in the dashboard name', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'vrt-config-'));
    const configPath = join(dir, '.vrt.json');
    await writeFile(
      configPath,
      JSON.stringify({
        thresholds: { 'checkout-spec-ts-login-works': 9 },
      }),
    );

    const reporter = createVrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      configPath,
    });

    reporter.onTestEnd(testLike(), result());
    await reporter.onEnd();

    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]!.pixelDiffThreshold).toBe(9);
  });

  it('uploads without a threshold when the config file is missing', async () => {
    const reporter = createVrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      configPath: '/nonexistent/vrt/.vrt.json',
    });

    reporter.onTestEnd(testLike(), result());
    await reporter.onEnd();

    const [captures] = uploadManyMock.mock.calls[0]!;
    expect(captures[0]!.pixelDiffThreshold).toBeUndefined();
  });

  it('reports a broken config instead of silently dropping uploads', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'vrt-config-'));
    const configPath = join(dir, '.vrt.json');
    await writeFile(configPath, '{not json');
    const onConfigError = vi.fn();

    const reporter = createVrtReporter({
      apiUrl: 'http://vrt.test/api/v1',
      apiKey: 'key-1',
      project: 'checkout',
      configPath,
      onConfigError,
    });

    reporter.onTestEnd(testLike(), result());
    await reporter.onEnd();

    expect(onConfigError).toHaveBeenCalledTimes(1);
    expect(uploadManyMock).toHaveBeenCalledTimes(1);
  });
});
