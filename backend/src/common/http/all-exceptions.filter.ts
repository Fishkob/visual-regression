import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '@common/domain/domain-error';
import { Prisma } from '@/prisma/client';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { RequestContext } from '@common/logging/request-context';
import { redactUrl } from '@common/logging/redact-url';
import {
  classifyException,
  classifyMulterError,
  classifyPrismaError,
  domainCodeToHttpStatus,
  finalHttpStatus,
  severityForStatus,
  type MulterErrorLike,
} from '@common/utils/exception-status';

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  // The dispatch is the single taxonomy from exception-status.ts — a new
  // exception type is classified in one place, and the interceptor's
  // status derivation cannot drift from this filter's branches.
  catch(exception: unknown, host: ArgumentsHost): void {
    const classified = classifyException(exception);
    switch (classified.kind) {
      case 'domain':
        this.catchDomainError(classified.error, host);
        break;
      case 'prisma':
        this.catchPrismaError(classified.error, host);
        break;
      case 'http':
        this.catchHttpException(classified.error, host);
        break;
      case 'multer':
        this.catchMulterError(classified.error, host);
        break;
      case 'unknown':
        this.catchUnknown(classified.error, host);
        break;
    }
  }

  // One envelope, one severity rule. Every branch derives only its status +
  // message and lets these two helpers own the traceId lookup, the log
  // dispatch, and the timestamp/path/json shape. The response and the log
  // deliberately diverge for 5xx: internal detail (raw S3/sidecar/Prisma
  // text) is what operators need in the log and is exactly what a client
  // must not receive, so the body is always the generic message.
  private sendError(
    host: ArgumentsHost,
    statusCode: number,
    message: string,
    body: Record<string, unknown>,
    log: (traceId: string) => string,
    stack?: unknown,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { traceId?: string }>();
    const traceId =
      RequestContext.traceId() ?? request.traceId ?? 'no-trace-id';

    const severity = severityForStatus(statusCode);
    const logMessage = log(traceId);
    if (severity === 'error') {
      this.logger.error(logMessage, stack as string | undefined);
    } else if (severity === 'warn') {
      this.logger.warn(logMessage);
    } else {
      this.logger.log(logMessage);
    }

    const errorResponse: ErrorResponseDto & Record<string, unknown> = {
      statusCode,
      message: statusCode >= 500 ? 'Internal server error' : message,
      timestamp: new Date().toISOString(),
      // The path is client-visible (and gets uploaded to /api/v1/log by client
      // error reporters), so a share token carried in the path is redacted here
      // exactly like the request log lines.
      path: redactUrl(request.url),
      traceId,
      ...body,
    };

    response.status(statusCode).json(errorResponse);
  }

  private catchDomainError(exception: DomainError, host: ArgumentsHost): void {
    const statusCode = domainCodeToHttpStatus(exception.code);
    this.sendError(
      host,
      statusCode,
      exception.message,
      { ...(exception.code ? { code: exception.code } : {}) },
      (traceId) =>
        `Domain error [${traceId}] ${exception.message} (${String(statusCode)})`,
      exception.stack,
    );
  }

  private catchPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const { status, message, code } = classifyPrismaError(exception);
    this.sendError(
      host,
      status,
      message,
      { ...(code ? { code } : {}) },
      (traceId) =>
        severityForStatus(status) === 'error'
          ? `Unhandled Prisma error (code: ${exception.code}) [${traceId}]`
          : // A handled 4xx (unique-constraint, record-not-found, serialization
            // conflict, FK violation) must be as visible in request logs as the
            // equivalent HttpException — otherwise debugging by logs silently
            // misses the most common Prisma failures.
            `Handled Prisma error (code: ${exception.code}) [${traceId}] ${message} (${String(status)})`,
      exception.stack,
    );
  }

  private catchHttpException(
    exception: HttpException,
    host: ArgumentsHost,
  ): void {
    const status = finalHttpStatus(exception);
    const res = exception.getResponse();

    let message = 'Request failed';
    let error: string | undefined;
    let errors: { field: string; messages: string[] }[] | undefined;
    const details: Record<string, unknown> = {};

    if (typeof res === 'string') {
      message = res;
    } else {
      const r = res as Record<string, unknown>;
      if ('message' in r) {
        const msgValue = r.message;

        if (Array.isArray(msgValue)) {
          // Compare against a plain number so the enum-vs-number comparison
          // stays lint-clean (the status came from finalHttpStatus as `number`).
          const unprocessableEntityStatus: number =
            HttpStatus.UNPROCESSABLE_ENTITY;
          if (status === unprocessableEntityStatus) {
            message = 'Validation failed';
            errors = msgValue.map((msg) => splitValidationMessage(msg));
          } else {
            message = msgValue.join('; ');
          }
        } else if (typeof msgValue === 'string') {
          message = msgValue;
        }
      }
      if ('error' in r && typeof r.error === 'string') {
        error = r.error;
      }
      // Custom structured bodies (e.g. DetailedHealthDto) carry fields beyond
      // the standard envelope — preserve them so clients keep the diagnostics.
      for (const key of Object.keys(r)) {
        if (!ENVELOPE_KEYS.has(key)) {
          details[key] = r[key];
        }
      }
    }

    this.sendError(
      host,
      status,
      message,
      {
        ...(error ? { error } : {}),
        ...(errors ? { errors } : {}),
        ...details,
      },
      (traceId) => {
        if (status >= 500) {
          return `Http server error [${traceId}] ${message} (${String(status)})`;
        }
        if (status >= 400) {
          return `Client error [${traceId}] ${message} (${String(status)})`;
        }
        return `Handled exception [${traceId}] ${message} (${String(status)})`;
      },
      exception.stack,
    );
  }

  private catchMulterError(
    exception: MulterErrorLike,
    host: ArgumentsHost,
  ): void {
    const { status, message } = classifyMulterError(exception);
    this.sendError(
      host,
      status,
      message,
      {},
      (traceId) => `Client error [${traceId}] ${message} (${String(status)})`,
    );
  }

  private catchUnknown(exception: unknown, host: ArgumentsHost): void {
    const statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    const url = host.switchToHttp().getRequest<Request & { url: string }>().url;
    // A non-Error throw (`throw 'boom'`, a rejected plain object) used to log
    // only the URL, leaving the operator with nothing to debug. Always log a
    // stringified value while the client body stays generic.
    const detail = describeThrownValue(exception);
    this.sendError(
      host,
      statusCode,
      'Internal server error',
      {},
      (traceId) =>
        `Unhandled server error [${traceId}] ${redactUrl(url)}: ${detail}`,
      exception instanceof Error ? exception.stack : undefined,
    );
  }
}

const ENVELOPE_KEYS = new Set([
  'statusCode',
  'message',
  'error',
  'errors',
  'timestamp',
  'path',
  'traceId',
]);

function splitValidationMessage(msg: unknown): {
  field: string;
  messages: string[];
} {
  const text = String(msg);
  const separatorIndex = text.indexOf(':');
  if (separatorIndex === -1) {
    return { field: '', messages: [text] };
  }
  return {
    field: text.slice(0, separatorIndex).trim(),
    messages: [text.slice(separatorIndex + 1).trim()],
  };
}

// A thrown value is not necessarily an Error. Format whatever arrived so the
// log line always names the failure, and never let a hostile `toString`/getter
// turn the logging path into a second exception.
function describeThrownValue(exception: unknown): string {
  if (exception instanceof Error) {
    return `${exception.name}: ${exception.message}`;
  }
  if (typeof exception === 'string') return exception;
  try {
    return String(exception);
  } catch {
    return '<unprintable thrown value>';
  }
}
