import { HttpException, HttpStatus } from '@nestjs/common';
import { DomainError, type DomainErrorCode } from '@common/domain/domain-error';
import { Prisma } from '@/prisma/client';

export type LogSeverity = 'info' | 'warn' | 'error';

// The one home for the "how loud is this status" rule: 5xx are errors, 4xx are
// client warnings, everything else is informational. The interceptor and every
// branch of the exception filter classify through here so the rule can't drift.
export function severityForStatus(status: number): LogSeverity {
  // Compare against literal status thresholds — the argument is a plain
  // `number`, and comparing it to the HttpStatus enum trips the
  // no-unsafe-enum-comparison rule.
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

// The one "which exception types exist" taxonomy. Both the exception filter's
// catch dispatch and the interceptor status derivation classify through here,
// so a new exception type is added in exactly one place instead of the filter's
// instanceof chain AND this status function drifting apart.
export type ClassifiedException =
  | { kind: 'domain'; error: DomainError }
  | { kind: 'prisma'; error: Prisma.PrismaClientKnownRequestError }
  | { kind: 'http'; error: HttpException }
  | { kind: 'multer'; error: { message: string } }
  | { kind: 'unknown'; error: unknown };

export function classifyException(exception: unknown): ClassifiedException {
  if (exception instanceof DomainError) {
    return { kind: 'domain', error: exception };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return { kind: 'prisma', error: exception };
  }
  if (exception instanceof HttpException) {
    return { kind: 'http', error: exception };
  }
  if (isMulterFileSizeError(exception)) {
    return { kind: 'multer', error: exception };
  }
  return { kind: 'unknown', error: exception };
}

// The exception filter runs after the interceptor's error tap, so
// res.statusCode is still the Express default at that point. Derive the
// status from the exception itself instead of the untouched response.
export function exceptionHttpStatus(err: unknown): number {
  const classified = classifyException(err);
  switch (classified.kind) {
    case 'http':
      return classified.error.getStatus();
    case 'domain':
      return domainCodeToHttpStatus(classified.error.code);
    case 'prisma':
      return prismaErrorToHttpStatus(classified.error);
    case 'multer':
      return HttpStatus.PAYLOAD_TOO_LARGE;
    case 'unknown':
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

// The final status a client receives — the exception filter's only rewrite,
// the array-message BadRequest → 422 promotion, lives here so the metrics and
// logging interceptors record the same status the filter serves instead of the
// raw exception status (400) that the client never sees.
export function finalHttpStatus(err: unknown): number {
  if (err instanceof HttpException) {
    let status = err.getStatus();
    const res = err.getResponse();
    // Compare against a plain number so the enum-vs-number comparison stays
    // lint-clean (the argument is `number`, not HttpStatus).
    const badRequestStatus: number = HttpStatus.BAD_REQUEST;
    if (
      status === badRequestStatus &&
      typeof res === 'object' &&
      res !== null &&
      Array.isArray((res as Record<string, unknown>).message)
    ) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
    }
    return status;
  }
  return exceptionHttpStatus(err);
}

export function isMulterFileSizeError(
  exception: unknown,
): exception is { message: string } {
  if (typeof exception !== 'object' || exception === null) {
    return false;
  }
  const candidate = exception as { name?: unknown; code?: unknown };
  return (
    candidate.name === 'MulterError' && candidate.code === 'LIMIT_FILE_SIZE'
  );
}

export interface PrismaErrorDetails {
  status: HttpStatus;
  message: string;
  code?: string;
}

export function classifyPrismaError(
  err: Prisma.PrismaClientKnownRequestError,
): PrismaErrorDetails {
  switch (err.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        message: 'Unique constraint failed',
        code: 'E_UNIQUE_CONSTRAINT',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Record not found',
        code: 'E_RECORD_NOT_FOUND',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      };
  }
}

export function prismaErrorToHttpStatus(
  err: Prisma.PrismaClientKnownRequestError,
): number {
  return classifyPrismaError(err).status;
}

export function domainCodeToHttpStatus(code?: DomainErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'CONFLICT':
    case 'E_UNIQUE_CONSTRAINT':
      return HttpStatus.CONFLICT;
    case 'FORBIDDEN':
      return HttpStatus.FORBIDDEN;
    case 'SIDECAR_ERROR':
      return HttpStatus.BAD_GATEWAY;
    case 'BAD_REQUEST':
    case 'INVALID_STATE':
      return HttpStatus.BAD_REQUEST;
    case 'INTERNAL_ERROR':
      return HttpStatus.INTERNAL_SERVER_ERROR;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
