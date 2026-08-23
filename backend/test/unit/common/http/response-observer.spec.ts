import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { firstValueFrom, Observable } from 'rxjs';
import { httpRoute, observeFinalStatus } from '@/common/http/response-observer';

interface MockRes {
  statusCode: number | undefined;
}

interface MockReq {
  baseUrl: string;
  path: string;
  route?: { path?: string };
}

function createMockContext(overrides?: {
  res?: Partial<MockRes>;
  req?: Partial<MockReq>;
}): ExecutionContext {
  const res: MockRes = { statusCode: 200, ...overrides?.res };
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => overrides?.req ?? {},
    }),
  } as unknown as ExecutionContext;
}

function successfulHandler(): CallHandler {
  return {
    handle: () => new Observable((s) => (s.next('ok'), s.complete())),
  };
}

describe('observeFinalStatus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records the effective response status exactly once after a successful handler', async () => {
    const onStatus = jest.fn();
    const ctx = createMockContext();

    await firstValueFrom(
      observeFinalStatus(ctx, successfulHandler(), onStatus),
    );

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(200, undefined);
  });

  it('records the status the framework wrote (201) instead of the Express default 200', async () => {
    const onStatus = jest.fn();
    const ctx = createMockContext({ res: { statusCode: 201 } });

    await firstValueFrom(
      observeFinalStatus(ctx, successfulHandler(), onStatus),
    );

    expect(onStatus).toHaveBeenCalledWith(201, undefined);
  });

  it('records the final error status when the handler throws', async () => {
    const onStatus = jest.fn();
    const ctx = createMockContext();
    const err = new BadRequestException('validation failed');
    const failingHandler: CallHandler = {
      handle: () => new Observable((s) => s.error(err)),
    };

    await expect(
      firstValueFrom(observeFinalStatus(ctx, failingHandler, onStatus)),
    ).rejects.toThrow();

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(400, err);
  });

  it('records the filter-promoted 422 for an array-message BadRequest', async () => {
    const onStatus = jest.fn();
    const ctx = createMockContext();
    const err = new BadRequestException(['field', 'is required']);
    const failingHandler: CallHandler = {
      handle: () => new Observable((s) => s.error(err)),
    };

    await expect(
      firstValueFrom(observeFinalStatus(ctx, failingHandler, onStatus)),
    ).rejects.toThrow();

    expect(onStatus).toHaveBeenCalledWith(422, err);
  });

  it('keeps the error record even though finalize fires with the untouched response default', async () => {
    const onStatus = jest.fn();
    const ctx = createMockContext({ res: { statusCode: 200 } });
    const err = new BadRequestException('nope');
    const failingHandler: CallHandler = {
      handle: () => new Observable((s) => s.error(err)),
    };

    await expect(
      firstValueFrom(observeFinalStatus(ctx, failingHandler, onStatus)),
    ).rejects.toThrow();

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(400, err);
  });

  it('defaults to 200 when statusCode is undefined', async () => {
    const onStatus = jest.fn();
    const ctx = createMockContext({ res: { statusCode: undefined } });

    await firstValueFrom(
      observeFinalStatus(ctx, successfulHandler(), onStatus),
    );

    expect(onStatus).toHaveBeenCalledWith(200, undefined);
  });
});

describe('httpRoute', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('combines baseUrl and route path', () => {
    const req: MockReq = {
      baseUrl: '/api/v1',
      path: '/api/v1/projects/p1/tests/t1',
      route: { path: '/projects/:name/tests/:name' },
    };

    expect(httpRoute(req as never)).toBe('/api/v1/projects/:name/tests/:name');
  });

  it('falls back to the given unmatched route when the handler is not a route', () => {
    const req: MockReq = { baseUrl: '', path: '/no-match', route: undefined };

    expect(httpRoute(req as never, 'unmatched')).toBe('unmatched');
  });

  it('defaults the unmatched fallback to req.path', () => {
    const req: MockReq = { baseUrl: '', path: '/no-match', route: undefined };

    expect(httpRoute(req as never)).toBe('/no-match');
  });
});
