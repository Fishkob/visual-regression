import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createVrtReporter } from '../playwright-reporter';
import { uploadMany } from '../upload-many';

vi.mock('../upload-many', () => ({ uploadMany: vi.fn() }));

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

  it('uploads the screenshot of a passing test under the title path', async () => {
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
        testName: 'checkout.spec.ts / login works',
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
