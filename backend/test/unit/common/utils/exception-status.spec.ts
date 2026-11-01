import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { DomainError, type DomainErrorCode } from '@common/domain/domain-error';
import { Prisma } from '@/prisma/client';
import {
  classifyException,
  classifyMulterError,
  classifyPrismaError,
  exceptionHttpStatus,
  finalHttpStatus,
} from '@common/utils/exception-status';

describe('exceptionHttpStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the status of an HttpException', () => {
    expect(exceptionHttpStatus(new BadRequestException('bad'))).toBe(400);
  });

  it('maps NOT_FOUND DomainError to 404', () => {
    expect(exceptionHttpStatus(new DomainError('missing', 'NOT_FOUND'))).toBe(
      404,
    );
  });

  it('maps CONFLICT DomainError to 409', () => {
    expect(exceptionHttpStatus(new DomainError('conflict', 'CONFLICT'))).toBe(
      409,
    );
  });

  it('maps E_UNIQUE_CONSTRAINT DomainError to 409', () => {
    expect(
      exceptionHttpStatus(new DomainError('dup', 'E_UNIQUE_CONSTRAINT')),
    ).toBe(409);
  });

  it('maps FORBIDDEN DomainError to 403', () => {
    expect(exceptionHttpStatus(new DomainError('forbidden', 'FORBIDDEN'))).toBe(
      403,
    );
  });

  it('maps SIDECAR_ERROR DomainError to 502', () => {
    expect(
      exceptionHttpStatus(new DomainError('sidecar down', 'SIDECAR_ERROR')),
    ).toBe(502);
  });

  it('maps BAD_REQUEST DomainError to 400', () => {
    expect(exceptionHttpStatus(new DomainError('bad', 'BAD_REQUEST'))).toBe(
      400,
    );
  });

  it('maps INVALID_STATE DomainError to 400', () => {
    expect(exceptionHttpStatus(new DomainError('state', 'INVALID_STATE'))).toBe(
      400,
    );
  });

  it('maps INTERNAL_ERROR DomainError to 500', () => {
    expect(exceptionHttpStatus(new DomainError('boom', 'INTERNAL_ERROR'))).toBe(
      500,
    );
  });

  it('maps a DomainError with no code to 500', () => {
    expect(exceptionHttpStatus(new DomainError('no code'))).toBe(500);
  });

  it('maps unknown DomainError codes to 500', () => {
    expect(
      exceptionHttpStatus(new DomainError('x', 'WHATEVER' as DomainErrorCode)),
    ).toBe(500);
  });

  it('returns 500 for generic errors', () => {
    expect(exceptionHttpStatus(new Error('boom'))).toBe(500);
    expect(exceptionHttpStatus('string error')).toBe(500);
    expect(exceptionHttpStatus(undefined)).toBe(500);
  });

  it('maps Multer LIMIT_FILE_SIZE to 413', () => {
    const multerError = {
      name: 'MulterError',
      code: 'LIMIT_FILE_SIZE',
      message: 'File too large',
    };
    expect(exceptionHttpStatus(multerError)).toBe(413);
  });

  it('maps every other Multer code to 400', () => {
    for (const code of [
      'LIMIT_FILE_COUNT',
      'LIMIT_FIELD_COUNT',
      'LIMIT_PART_COUNT',
      'LIMIT_FIELD_VALUE',
      'LIMIT_FIELD_KEY',
      'LIMIT_UNEXPECTED_FILE',
    ]) {
      expect(
        exceptionHttpStatus({ name: 'MulterError', code, message: code }),
      ).toBe(400);
    }
  });

  it('maps Prisma unique constraint errors to 409', () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(exceptionHttpStatus(error)).toBe(409);
  });

  it('maps Prisma record-not-found errors to 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(exceptionHttpStatus(error)).toBe(404);
  });

  it('maps Prisma serialization conflicts to 409', () => {
    const error = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });
    expect(exceptionHttpStatus(error)).toBe(409);
  });

  it('maps Prisma foreign-key violations to 409', () => {
    const error = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: 'test',
    });
    expect(exceptionHttpStatus(error)).toBe(409);
  });

  it('maps unknown Prisma errors to 500', () => {
    const error = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2000',
      clientVersion: 'test',
    });
    expect(exceptionHttpStatus(error)).toBe(500);
  });
});

describe('finalHttpStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('promotes an array-message BadRequest to 422 like the exception filter', () => {
    expect(
      finalHttpStatus(new BadRequestException(['name must be a string'])),
    ).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('keeps a single-message BadRequest at 400', () => {
    expect(finalHttpStatus(new BadRequestException('bad'))).toBe(400);
  });

  it('keeps other HttpExceptions at their own status', () => {
    expect(
      finalHttpStatus(new HttpException('nope', HttpStatus.NOT_FOUND)),
    ).toBe(404);
  });

  it('delegates to the same rules as exceptionHttpStatus for non-HttpException', () => {
    expect(finalHttpStatus(new DomainError('missing', 'NOT_FOUND'))).toBe(404);
    const prisma = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(finalHttpStatus(prisma)).toBe(409);
    expect(finalHttpStatus(new Error('boom'))).toBe(500);
  });
});

describe('classifyPrismaError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps P2002 to conflict with message and code', () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    expect(classifyPrismaError(err)).toEqual({
      status: HttpStatus.CONFLICT,
      message: 'Unique constraint failed',
      code: 'E_UNIQUE_CONSTRAINT',
    });
  });

  it('maps P2025 to not found', () => {
    const err = new Prisma.PrismaClientKnownRequestError('gone', {
      code: 'P2025',
      clientVersion: 'x',
    });
    expect(classifyPrismaError(err).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps unknown codes to 500 without a code', () => {
    const err = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2000',
      clientVersion: 'x',
    });
    const result = classifyPrismaError(err);
    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.code).toBeUndefined();
  });

  it('maps P2034 to a conflict that suggests a retry without leaking detail', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Transaction failed due to a write conflict or a deadlock',
      { code: 'P2034', clientVersion: 'x' },
    );

    expect(classifyPrismaError(err)).toEqual({
      status: HttpStatus.CONFLICT,
      message: 'Transaction conflict, please retry',
      code: 'E_SERIALIZATION_CONFLICT',
    });
  });

  it('maps P2003 to a conflict with a foreign-key code', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field: `testId`',
      { code: 'P2003', clientVersion: 'x' },
    );

    expect(classifyPrismaError(err)).toEqual({
      status: HttpStatus.CONFLICT,
      message: 'Related record constraint violated',
      code: 'E_FOREIGN_KEY_VIOLATION',
    });
  });
});

describe('classifyMulterError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the 413 status and limit message for LIMIT_FILE_SIZE', () => {
    expect(
      classifyMulterError({
        name: 'MulterError',
        code: 'LIMIT_FILE_SIZE',
        message: 'File too large',
      }),
    ).toEqual({
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      message: 'File too large',
    });
  });

  it('falls back to a limit-shaped message when LIMIT_FILE_SIZE has none', () => {
    expect(
      classifyMulterError({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' }),
    ).toEqual({
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      message: 'File too large',
    });
  });

  it('turns every other Multer code into a generic 400', () => {
    for (const code of [
      'LIMIT_FILE_COUNT',
      'LIMIT_FIELD_COUNT',
      'LIMIT_PART_COUNT',
      'LIMIT_FIELD_VALUE',
      'LIMIT_FIELD_KEY',
      'LIMIT_UNEXPECTED_FILE',
    ]) {
      expect(
        classifyMulterError({ name: 'MulterError', code, message: 'raw' }),
      ).toEqual({
        status: HttpStatus.BAD_REQUEST,
        message: `Invalid multipart upload: ${code}`,
      });
    }
  });
});

describe('classifyException', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies every Multer code as a multer error', () => {
    for (const code of ['LIMIT_FILE_SIZE', 'LIMIT_UNEXPECTED_FILE']) {
      expect(
        classifyException({ name: 'MulterError', code, message: code }),
      ).toMatchObject({ kind: 'multer' });
    }
  });

  it('does not classify a non-Multer object as a multer error', () => {
    expect(
      classifyException({ name: 'Error', code: 'LIMIT_FILE_SIZE' }),
    ).toMatchObject({ kind: 'unknown' });
  });
});
