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
  | { kind: 'multer'; error: MulterErrorLike }
  | { kind: 'clientStatus'; error: ClientStatusError }
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
  if (isMulterError(exception)) {
    return { kind: 'multer', error: exception };
  }
  if (isClientStatusError(exception)) {
    return { kind: 'clientStatus', error: exception };
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
      return classifyMulterError(classified.error).status;
    case 'clientStatus':
      return classified.error.status;
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

// Every code Multer can raise. The intake module deliberately bounds the upload
// shape (files: 1, fields: 20, parts: 25, fieldSize: 8 KiB), so only
// LIMIT_FILE_SIZE is a "too large" verdict — the rest mean the request did not
// match the multipart contract and are client errors (400), not 500s.
export interface MulterErrorLike {
  name: 'MulterError';
  code: string;
  message?: string;
}

export function isMulterError(
  exception: unknown,
): exception is MulterErrorLike {
  if (typeof exception !== 'object' || exception === null) {
    return false;
  }
  const candidate = exception as { name?: unknown; code?: unknown };
  return candidate.name === 'MulterError' && typeof candidate.code === 'string';
}

export interface MulterErrorDetails {
  status: HttpStatus;
  message: string;
}

// The single home for "which status/message does this Multer code get", so the
// filter's body and the interceptor's recorded status cannot disagree.
export function classifyMulterError(
  error: MulterErrorLike,
): MulterErrorDetails {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      message: error.message ?? 'File too large',
    };
  }
  return {
    status: HttpStatus.BAD_REQUEST,
    message: `Invalid multipart upload: ${error.code}`,
  };
}

// body-parser (and raw-body under it) rejects a request itself and tags the
// error with the status the client should see — an oversized body carries 413,
// a malformed one 400. The catch-all filter sits behind those middlewares, so
// without this branch the rejection was served as a 500 and logged as a server
// fault, which is the opposite of what happened: the request was too big.
export interface ClientStatusError {
  status: number;
  message?: string;
  stack?: string;
}

export function isClientStatusError(
  exception: unknown,
): exception is ClientStatusError {
  if (typeof exception !== 'object' || exception === null) {
    return false;
  }
  const candidate = exception as { status?: unknown; statusCode?: unknown };
  const status =
    typeof candidate.status === 'number'
      ? candidate.status
      : candidate.statusCode;
  // Only a client-error range status is taken on trust; anything else keeps the
  // generic 500, because a thrown object claiming 503 is not a client verdict.
  return typeof status === 'number' && status >= 400 && status < 500;
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
    // A raw statement's serialization failure (SQLSTATE 40001 arrives as
    // P2010 + meta.code): same verdict as P2034 — retried already, tell the
    // client to retry rather than answering 500.
    case 'P2010':
      if ((err.meta as { code?: unknown } | undefined)?.code === '40001') {
        return {
          status: HttpStatus.CONFLICT,
          message: 'Transaction conflict, please retry',
          code: 'E_SERIALIZATION_CONFLICT',
        };
      }
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      };
    // Exhausted serialization conflict: the workflow already retried, so the
    // client is told to retry — the underlying transaction detail stays out.
    case 'P2034':
      return {
        status: HttpStatus.CONFLICT,
        message: 'Transaction conflict, please retry',
        code: 'E_SERIALIZATION_CONFLICT',
      };
    // A foreign key the request referenced does not exist (or is still
    // referenced): a conflicting state of the request, not a server fault.
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        message: 'Related record constraint violated',
        code: 'E_FOREIGN_KEY_VIOLATION',
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
    case 'QUOTA_EXCEEDED':
      return HttpStatus.PAYLOAD_TOO_LARGE;
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
