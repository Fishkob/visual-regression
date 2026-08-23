import type { Mock, Mocked } from 'vitest';
import { LoggingInterceptor } from '@/common/http/logging.interceptor';
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { Observable, asyncScheduler, firstValueFrom, scheduled } from 'rxjs';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMockLogger } from '@test/utils/mocks';
interface MockReq {
  method: string;
  url: string;
  headers: Record<string, string>;
  ip: string;
  body: Record<string, unknown>;
  res: MockRes;
  traceId?: string;
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  setHeader: Mock<(key: string, val: string) => void>;
}

describe('LoggingInterceptor (unit)', () => {
  let interceptor: LoggingInterceptor;
  let handler: CallHandler;
  let logger: Mocked<AppLoggerService>;

  beforeEach(() => {
    logger = createMockLogger();

    interceptor = new LoggingInterceptor(logger);
    handler = { handle: () => scheduled(['ok'], asyncScheduler) };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockContext(): ExecutionContext {
    const res: MockRes = {
      statusCode: 200,
      headers: {},
      setHeader: vi.fn((key: string, val: string): void => {
        res.headers[key] = val;
      }),
    };

    const req: MockReq = {
      method: 'GET',
      url: '/test',
      headers: { authorization: 'secret' },
      ip: '127.0.0.1',
      body: {},
      res,
    };

    return {
      switchToHttp: () => ({
        getRequest: (): MockReq => req,
        getResponse: (): MockRes => res,
      }),
      getType: () => 'http',
    } as unknown as ExecutionContext;
  }

  it('adds traceId and logs structured start and end messages', async () => {
    const ctx = createMockContext();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    await firstValueFrom(interceptor.intercept(ctx, handler));

    // ✅ traceId attached
    expect(typeof req.traceId).toBe('string');
    expect(req.traceId.length).toBeGreaterThan(10);
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Trace-Id',
      expect.any(String),
    );
    expect(res.headers['X-Trace-Id']).toBeDefined();

    // ✅ structured logs
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Incoming request',
        method: 'GET',
        url: '/test',
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Request completed',
        method: 'GET',
        url: '/test',
        statusCode: 200,
      }),
    );
  });

  it('logs the effective status the framework wrote (201) on success', async () => {
    const ctx = createMockContext();
    (ctx.switchToHttp().getResponse() as MockRes).statusCode = 201;

    await firstValueFrom(interceptor.intercept(ctx, handler));

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Request completed',
        method: 'GET',
        url: '/test',
        statusCode: 201,
      }),
    );
  });

  it('logs structured error when observable throws', async () => {
    const ctx = createMockContext();

    const failingHandler: CallHandler = {
      handle: (): Observable<never> =>
        new Observable((subscriber) => {
          subscriber.error(new Error('Bad Request'));
        }),
    };

    await expect(
      firstValueFrom(interceptor.intercept(ctx, failingHandler)),
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Request failed',
        method: 'GET',
        url: '/test',
        error: 'Bad Request',
        statusCode: 500,
      }),
      expect.any(String), // stack trace
    );
  });

  it('logs the HttpException status instead of the response default 200', async () => {
    const ctx = createMockContext();

    const failingHandler: CallHandler = {
      handle: (): Observable<never> =>
        new Observable((subscriber) => {
          subscriber.error(new BadRequestException('Bad Request'));
        }),
    };

    await expect(
      firstValueFrom(interceptor.intercept(ctx, failingHandler)),
    ).rejects.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Request failed',
        error: 'Bad Request',
        statusCode: 400,
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('handles non-Error throws with string coercion', async () => {
    const ctx = createMockContext();

    const failingHandler: CallHandler = {
      handle: (): Observable<never> =>
        new Observable((subscriber) => {
          subscriber.error('Raw string error');
        }),
    };

    await expect(
      firstValueFrom(interceptor.intercept(ctx, failingHandler)),
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Request failed',
        error: 'Raw string error',
      }),
      'Raw string error',
    );
  });
});
