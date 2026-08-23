import { Test, TestingModule } from '@nestjs/testing';
import { PdfSidecarClient } from '@internal/pdf-sidecar/pdf-sidecar.client';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AppConfigService } from '@config/app-config.service';
import { createMockLogger } from '@test/utils/mocks';
import { DomainError } from '@common/domain/domain-error';

describe('PdfSidecarClient', () => {
  let client: PdfSidecarClient;
  let fetchMock: jest.Mock;
  let logger: ReturnType<typeof createMockLogger>;
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  beforeEach(async () => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfSidecarClient,
        { provide: AppLoggerService, useValue: logger },
        {
          provide: AppConfigService,
          useValue: {
            pdfSidecar: {
              url: 'http://sidecar:3001',
              timeout: 30_000,
              healthUrl: undefined,
            },
          },
        },
      ],
    }).compile();

    client = module.get(PdfSidecarClient);
  });

  it('implements the pdf comparison engine seam', () => {
    expect(client.kind).toBe('pdf');
  });

  describe('compare', () => {
    const expected = Buffer.from('expected-pdf-content');
    const actual = Buffer.from('actual-pdf-content');

    it('posts multipart form to /compare and returns ComparisonResult', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-mismatch-count') return '2';
            if (name === 'x-page-count') return '4';
            return null;
          },
        },
        arrayBuffer: () =>
          Promise.resolve(
            new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]).buffer,
          ),
      });

      const result = await client.compare(expected, actual);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://sidecar:3001/compare',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
      expect(result).toMatchObject({ kind: 'pdf', mismatchPageCount: 2 });
      expect(result.pageCount).toBe(4);
      expect(Buffer.isBuffer(result.diffOutput)).toBe(true);
      expect(result.diffOutput.length).toBe(8);
    });

    it('appends threshold field to the form body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-mismatch-count') return '0';
            if (name === 'x-page-count') return '1';
            return null;
          },
        },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      await client.compare(expected, actual);

      const body = fetchMock.mock.calls[0][1].body as FormData;
      expect(body.get('threshold')).toBe('0');
    });

    it('throws a permanent DomainError on a 4xx rejection', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid PDF'),
      });

      await expect(client.compare(expected, actual)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'PDF sidecar rejected /compare (400): Invalid PDF',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails loud when the sidecar omits the page-count header', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'x-mismatch-count' ? '2' : null),
        },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      await expect(client.compare(expected, actual)).rejects.toMatchObject({
        code: 'SIDECAR_ERROR',
        message: 'PDF sidecar /compare omitted x-page-count header',
      });
    });

    it('fails loud when the sidecar omits the mismatch-count header', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'x-page-count' ? '4' : null),
        },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      await expect(client.compare(expected, actual)).rejects.toMatchObject({
        code: 'SIDECAR_ERROR',
        message: 'PDF sidecar /compare omitted x-mismatch-count header',
      });
    });

    it('fails loud when the page-count header is not a number', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-mismatch-count') return '2';
            if (name === 'x-page-count') return 'many';
            return null;
          },
        },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      await expect(client.compare(expected, actual)).rejects.toMatchObject({
        code: 'SIDECAR_ERROR',
        message: 'PDF sidecar /compare returned invalid x-page-count: "many"',
      });
    });

    it('handles text() rejection gracefully', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.reject(new Error('connection reset')),
      });

      await expect(client.compare(expected, actual)).rejects.toThrow(
        'PDF sidecar rejected /compare (400): unknown error',
      );
    });

    it('retries a transient network failure and succeeds', async () => {
      vi.useFakeTimers();
      try {
        fetchMock
          .mockRejectedValueOnce(new TypeError('fetch failed'))
          .mockResolvedValueOnce({
            ok: true,
            headers: {
              get: (name: string) => {
                if (name === 'x-mismatch-count') return '0';
                if (name === 'x-page-count') return '1';
                return null;
              },
            },
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          });

        const promise = client.compare(expected, actual);
        await vi.advanceTimersByTimeAsync(3000);
        const result = await promise;

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ kind: 'pdf', mismatchPageCount: 0 });
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('retrying'),
          expect.any(Object),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry an HTTP error response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid PDF'),
      });

      await expect(client.compare(expected, actual)).rejects.toThrow(
        DomainError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries a 5xx sidecar error and succeeds', async () => {
      vi.useFakeTimers();
      try {
        fetchMock
          .mockResolvedValueOnce({
            ok: false,
            status: 503,
            text: () => Promise.resolve('Service Unavailable'),
          })
          .mockResolvedValueOnce({
            ok: true,
            headers: {
              get: (name: string) => {
                if (name === 'x-mismatch-count') return '0';
                if (name === 'x-page-count') return '1';
                return null;
              },
            },
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          });

        const promise = client.compare(expected, actual);
        await vi.advanceTimersByTimeAsync(3000);
        await promise;

        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('count', () => {
    it('posts multipart form to /count and resolves page count from header', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'x-page-count' ? '3' : null),
        },
      });

      const pageCount = await client.count(Buffer.from('pdf-content'));

      expect(fetchMock).toHaveBeenCalledWith(
        'http://sidecar:3001/count',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(pageCount).toBe(3);
    });

    it('throws a permanent DomainError on a 4xx rejection', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid PDF'),
      });

      await expect(
        client.count(Buffer.from('pdf-content')),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'PDF sidecar rejected /count (400): Invalid PDF',
      });
    });

    it('fails loud when the count endpoint omits the page-count header', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });

      await expect(
        client.count(Buffer.from('pdf-content')),
      ).rejects.toMatchObject({
        code: 'SIDECAR_ERROR',
        message: 'PDF sidecar /count omitted x-page-count header',
      });
    });
  });

  describe('renderPage', () => {
    it('posts multipart form to /render and returns image buffer with page count', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'x-page-count' ? '5' : null),
        },
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      });

      const result = await client.renderPdfPage(Buffer.from('pdf-content'), 1);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://sidecar:3001/render',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.pageCount).toBe(5);
      expect(Buffer.isBuffer(result.imageBuffer)).toBe(true);
    });

    it('fails loud when the page-count header is missing', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      await expect(
        client.renderPdfPage(Buffer.from('pdf-content'), 1),
      ).rejects.toMatchObject({
        code: 'SIDECAR_ERROR',
        message: 'PDF sidecar /render omitted x-page-count header',
      });
    });

    it('throws a NOT_FOUND domain error with page count when 400 includes pageCount', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({ error: 'page out of range', pageCount: 3 }),
          ),
      });

      await expect(
        client.renderPdfPage(Buffer.from('pdf-content'), 5),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Page 5 exceeds document page count (3)',
      });
    });

    it('throws a NOT_FOUND domain error when 400 has no pageCount', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ error: 'invalid pdf' })),
      });

      await expect(
        client.renderPdfPage(Buffer.from('pdf-content'), 1),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'invalid pdf' });
    });

    it('does not crash on a 400 with a non-JSON body', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request: not a pdf'),
      });

      await expect(
        client.renderPdfPage(Buffer.from('pdf-content'), 1),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws a permanent NOT_FOUND for a non-400 4xx without a warning', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(
        client.renderPdfPage(Buffer.from('pdf-content'), 1),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'PDF sidecar rejected /render (404): Not Found',
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('throws a transient SidecarHttpError for a 5xx and logs a warning', async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve('boom'),
        });

        const promise = client.renderPdfPage(Buffer.from('pdf-content'), 1);
        const assertion = expect(promise).rejects.toMatchObject({
          code: 'SIDECAR_ERROR',
          message: 'PDF sidecar /render returned 500: boom',
        });
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
        expect(logger.warn).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('handles text() rejection gracefully with unknown body', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.reject(new Error('connection reset')),
      });

      await expect(
        client.renderPdfPage(Buffer.from('pdf-content'), 1),
      ).rejects.toThrow('PDF sidecar rejected /render (404): unknown error');
    });
  });
});
