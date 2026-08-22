import { Injectable, LoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '@common/logging/request-context';
@Injectable()
export class AppLoggerService implements LoggerService {
  private context = 'App';

  constructor(private readonly pino: PinoLogger) {}

  private base(extra?: Record<string, unknown>) {
    const traceId = RequestContext.traceId();
    return {
      traceId: traceId ?? 'no-trace',
      timestamp: new Date().toISOString(),
      context: this.context,
      ...extra,
    };
  }

  log(
    message: string | Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): void {
    this.pino.info(this.format('INFO', message, extra));
  }

  warn(
    message: string | Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): void {
    this.pino.warn(this.format('WARN', message, extra));
  }

  debug(
    message: string | Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): void {
    this.pino.debug(this.format('DEBUG', message, extra));
  }

  error(
    message: string | Record<string, unknown>,
    trace?: string,
    extra?: Record<string, unknown>,
  ): void {
    const structured: Record<string, unknown> = this.format(
      'ERROR',
      message,
      extra,
    );

    if (trace) {
      const msgText =
        typeof message === 'string'
          ? message
          : 'msg' in message && typeof message.msg === 'string'
            ? message.msg
            : 'Unknown error';

      structured.err = {
        type: 'Error',
        message: msgText,
        stack: trace,
      };
    }

    this.pino.error(structured);
  }

  private format(
    level: string,
    message: string | Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) {
    const base = this.base({ level });
    if (typeof message === 'string') {
      return { ...base, msg: message, ...extra };
    }
    return { ...base, ...message, ...extra };
  }
}
