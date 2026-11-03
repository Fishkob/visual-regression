import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { LogIngestionService } from '@/modules/internal/logging/log-ingestion.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import type { Request } from 'express';
import { createMockLogger } from '@test/utils/mocks';

describe('LogIngestionService', () => {
  let service: LogIngestionService;
  let logger: Mocked<AppLoggerService>;

  function mockReq(headers?: Record<string, string>): Request {
    return {
      headers: { 'x-trace-id': undefined, ...headers },
    } as unknown as Request;
  }

  beforeEach(async () => {
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogIngestionService,
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(LogIngestionService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('traceId resolution', () => {
    it('uses x-trace-id header when present', () => {
      const req = mockReq({ 'x-trace-id': 'trace-123' });
      service.ingest({ message: 'hello' }, req);
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] hello',
        expect.objectContaining({ traceId: 'trace-123' }),
      );
    });

    it('falls back to body.traceId when no header', () => {
      service.ingest({ message: 'hello', traceId: 'body-trace' }, mockReq());
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] hello',
        expect.objectContaining({ traceId: 'body-trace' }),
      );
    });

    it('falls back to no-trace when neither header nor body.traceId', () => {
      service.ingest({ message: 'hello' }, mockReq());
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] hello',
        expect.objectContaining({ traceId: 'no-trace' }),
      );
    });

    it('strips control characters from the trace id', () => {
      const req = mockReq({ 'x-trace-id': 'a\u0000b\u001fc' });
      service.ingest({ message: 'hello' }, req);
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] hello',
        expect.objectContaining({ traceId: 'a b c' }),
      );
    });

    it('caps an over-long trace id at 128 chars', () => {
      const req = mockReq({ 'x-trace-id': 't'.repeat(200) });
      service.ingest({ message: 'hello' }, req);
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] hello',
        expect.objectContaining({ traceId: 't'.repeat(128) }),
      );
    });
  });

  describe('message default', () => {
    it('uses default message when body.message is not a string', () => {
      service.ingest({ message: 123 }, mockReq());
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] Frontend log event',
        expect.any(Object),
      );
    });

    it('uses body.message when it is a string', () => {
      service.ingest({ message: 'User action logged' }, mockReq());
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] User action logged',
        expect.any(Object),
      );
    });
  });

  describe('log level routing', () => {
    it('logs error when body.stack is present', () => {
      service.ingest({ message: 'error', stack: 'Error: boom' }, mockReq());
      expect(logger.error).toHaveBeenCalledWith(
        '[Frontend] error',
        'Error: boom',
        expect.any(Object),
      );
    });

    it('logs error without stack string when stack is not a string', () => {
      service.ingest({ message: 'error', stack: true }, mockReq());
      expect(logger.error).toHaveBeenCalledWith(
        '[Frontend] error',
        undefined,
        expect.any(Object),
      );
    });

    it('logs debug for web-vital type', () => {
      service.ingest(
        { type: 'web-vital', name: 'LCP', value: 2500 },
        mockReq(),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LCP',
          value: 2500,
          type: 'web-vital',
        }),
      );
    });

    it('logs debug with string value for web-vital', () => {
      service.ingest(
        { type: 'web-vital', name: 'CLS', value: '0.1' },
        mockReq(),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'CLS', value: '0.1' }),
      );
    });

    it('logs debug with unknown value for web-vital when value is neither', () => {
      service.ingest(
        { type: 'web-vital', name: 'FID', value: null },
        mockReq(),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'FID', value: 'unknown' }),
      );
    });

    it('logs warn for other events', () => {
      service.ingest({ message: 'info log' }, mockReq());
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] info log',
        expect.any(Object),
      );
    });
  });

  describe('sanitization', () => {
    it('strips control characters from the message', () => {
      service.ingest({ message: 'a\u0000b\u001fc\u007fd' }, mockReq());
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] a b c d',
        expect.any(Object),
      );
    });

    it('caps an over-long message at the maximum length', () => {
      service.ingest({ message: 'x'.repeat(5_000) }, mockReq());
      expect(logger.warn).toHaveBeenCalledWith(
        `[Frontend] ${'x'.repeat(2_000)}`,
        expect.any(Object),
      );
    });

    it('strips control characters and caps an over-long stack', () => {
      service.ingest(
        { message: 'error', stack: `${'y'.repeat(12_000)}\u0000` },
        mockReq(),
      );
      expect(logger.error).toHaveBeenCalledWith(
        '[Frontend] error',
        'y'.repeat(10_000),
        expect.any(Object),
      );
    });

    it('whitelists ctx keys instead of spreading the raw body', () => {
      service.ingest(
        { message: 'leak', password: 'hunter2', token: 'abc', traceId: 't-1' },
        mockReq(),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        '[Frontend] leak',
        expect.not.objectContaining({ password: 'hunter2', token: 'abc' }),
      );
    });
  });
});
