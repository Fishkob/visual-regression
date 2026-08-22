import { HttpMetricsInterceptor } from '@/common/http/http-metrics.interceptor';
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { firstValueFrom, Observable } from 'rxjs';
import { IMetricsRecorder } from '@common/domain/metrics-recorder.interface';
import { createMock } from '@test/utils/create-mock';

interface MockReq {
  method: string;
  baseUrl: string;
  route?: { path: string };
}

interface MockRes {
  statusCode: number;
}

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let metrics: jest.Mocked<IMetricsRecorder>;

  function createMockContext(
    overrides?: Partial<{
      req: Partial<MockReq>;
      res: Partial<MockRes>;
      type: string;
    }>,
  ): ExecutionContext {
    const req: MockReq = {
      method: 'GET',
      baseUrl: '',
      route: { path: '/tests' },
      ...overrides?.req,
    };
    const res: MockRes = {
      statusCode: 200,
      ...overrides?.res,
    };

    return {
      getType: () => overrides?.type ?? 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    metrics = createMock<IMetricsRecorder>();
    interceptor = new HttpMetricsInterceptor(metrics);
  });

  it('passes through non-HTTP contexts without recording metrics', async () => {
    const ctx = createMockContext({ type: 'graphql' });
    const handler: CallHandler = {
      handle: () => new Observable((s) => (s.next('ok'), s.complete())),
    };

    await firstValueFrom(interceptor.intercept(ctx, handler));

    expect(metrics.incrementCounter).not.toHaveBeenCalled();
    expect(metrics.observeHistogram).not.toHaveBeenCalled();
  });

  it('records histogram and counter on success', async () => {
    const ctx = createMockContext();
    const handler: CallHandler = {
      handle: () => new Observable((s) => (s.next('ok'), s.complete())),
    };

    await firstValueFrom(interceptor.intercept(ctx, handler));

    expect(metrics.observeHistogram).toHaveBeenCalledWith(
      'http_request_duration_ms',
      expect.any(Number),
      { method: 'GET', route: '/tests', status: '200' },
    );
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      { method: 'GET', route: '/tests', status: '200' },
    );
  });

  it('records the effective status the framework wrote (201) instead of the Express default 200', async () => {
    const ctx = createMockContext({ res: { statusCode: 201 } });
    const handler: CallHandler = {
      handle: () => new Observable((s) => (s.next('ok'), s.complete())),
    };

    await firstValueFrom(interceptor.intercept(ctx, handler));

    expect(metrics.observeHistogram).toHaveBeenCalledWith(
      'http_request_duration_ms',
      expect.any(Number),
      { method: 'GET', route: '/tests', status: '201' },
    );
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      { method: 'GET', route: '/tests', status: '201' },
    );
  });

  it('records metrics on error deriving status from HttpException', async () => {
    const ctx = createMockContext();
    const handler: CallHandler = {
      handle: () =>
        new Observable((s) =>
          s.error(new BadRequestException('validation failed')),
        ),
    };

    await expect(
      firstValueFrom(interceptor.intercept(ctx, handler)),
    ).rejects.toThrow();

    expect(metrics.observeHistogram).toHaveBeenCalledWith(
      'http_request_duration_ms',
      expect.any(Number),
      { method: 'GET', route: '/tests', status: '400' },
    );
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      { method: 'GET', route: '/tests', status: '400' },
    );
  });

  it('records 500 for generic errors even when the response still defaults to 200', async () => {
    const ctx = createMockContext();
    const handler: CallHandler = {
      handle: () =>
        new Observable((s) => s.error(new Error('unexpected failure'))),
    };

    await expect(
      firstValueFrom(interceptor.intercept(ctx, handler)),
    ).rejects.toThrow();

    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      { method: 'GET', route: '/tests', status: '500' },
    );
  });

  it('falls back to 500 when error has no status code', async () => {
    const ctx = createMockContext({
      res: { statusCode: undefined as unknown as number },
    });
    const handler: CallHandler = {
      handle: () => new Observable((s) => s.error('string error')),
    };

    await expect(
      firstValueFrom(interceptor.intercept(ctx, handler)),
    ).rejects.toBe('string error');

    expect(metrics.observeHistogram).toHaveBeenCalledWith(
      'http_request_duration_ms',
      expect.any(Number),
      { method: 'GET', route: '/tests', status: '500' },
    );
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      { method: 'GET', route: '/tests', status: '500' },
    );
  });

  it('uses "unmatched" route when req.route is undefined', async () => {
    const ctx = createMockContext({ req: { route: undefined } });
    const handler: CallHandler = {
      handle: () => new Observable((s) => (s.next('ok'), s.complete())),
    };

    await firstValueFrom(interceptor.intercept(ctx, handler));

    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      { method: 'GET', route: 'unmatched', status: '200' },
    );
  });

  it('combines baseUrl and route path', async () => {
    const ctx = createMockContext({
      req: { baseUrl: '/api/v1', route: { path: '/projects/:id' } },
    });
    const handler: CallHandler = {
      handle: () => new Observable((s) => (s.next('ok'), s.complete())),
    };

    await firstValueFrom(interceptor.intercept(ctx, handler));

    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      { method: 'GET', route: '/api/v1/projects/:id', status: '200' },
    );
  });
});
