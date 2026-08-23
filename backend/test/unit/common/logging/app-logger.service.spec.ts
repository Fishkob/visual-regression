import { AppLoggerService } from '@common/logging/app-logger.service';
import { RequestContext } from '@common/logging/request-context';
vi.mock('@common/logging/request-context', () => ({
  RequestContext: {
    traceId: vi.fn(),
  },
}));

describe('AppLoggerService', () => {
  let logger: AppLoggerService;
  let pino: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    pino = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };

    (RequestContext.traceId as any).mockReturnValue('trace-123');

    logger = new AppLoggerService(pino as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calls pino.info with formatted string message', () => {
    logger.log('test message');

    expect(pino.info).toHaveBeenCalledWith({
      traceId: 'trace-123',
      timestamp: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      ),
      context: 'App',
      level: 'INFO',
      msg: 'test message',
    });
  });

  it('calls pino.info with formatted object message', () => {
    logger.log({ key: 'value' });

    expect(pino.info).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-123',
        context: 'App',
        level: 'INFO',
        key: 'value',
      }),
    );
  });

  it('calls pino.warn with formatted message', () => {
    logger.warn('warning message');

    expect(pino.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'WARN',
        msg: 'warning message',
        traceId: 'trace-123',
      }),
    );
  });

  it('calls pino.debug with formatted message', () => {
    logger.debug('debug message');

    expect(pino.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'DEBUG',
        msg: 'debug message',
        traceId: 'trace-123',
      }),
    );
  });

  it('calls pino.error with structured.err when trace provided', () => {
    logger.error('error message', 'stack trace here');

    expect(pino.error).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        msg: 'error message',
        traceId: 'trace-123',
        err: {
          type: 'Error',
          message: 'error message',
          stack: 'stack trace here',
        },
      }),
    );
  });

  it('extracts msg from object message for err.message', () => {
    logger.error({ msg: 'structured error' }, 'stack trace');

    expect(pino.error).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        err: expect.objectContaining({
          type: 'Error',
          message: 'structured error',
          stack: 'stack trace',
        }),
      }),
    );
  });

  it('uses Unknown error for object message without msg field', () => {
    logger.error({ data: 'something' }, 'stack trace');

    expect(pino.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({
          message: 'Unknown error',
          stack: 'stack trace',
        }),
      }),
    );
  });

  it('calls pino.error without err when no trace provided', () => {
    logger.error('error without trace');

    const call = pino.error.mock.calls[0][0];
    expect(call).not.toHaveProperty('err');
    expect(call.msg).toBe('error without trace');
  });

  it('includes extra fields in log output', () => {
    logger.log('message', { userId: '123' });

    expect(pino.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'message',
        userId: '123',
      }),
    );
  });

  it('uses no-trace when RequestContext returns undefined', () => {
    (RequestContext.traceId as jest.Mock).mockReturnValue(undefined);

    logger.log('test');

    expect(pino.info).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'no-trace',
      }),
    );
  });
});
