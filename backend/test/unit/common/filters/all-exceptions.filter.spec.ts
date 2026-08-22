import { AllExceptionsFilter } from '@/common/http/all-exceptions.filter';
import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { DomainError } from '@common/domain/domain-error';
import { Prisma } from '@/prisma/client';
import { RequestContext } from '@common/logging/request-context';
import { createMockLogger } from '@test/utils/mocks';
import type { Request, Response } from 'express';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: Pick<Response, 'status' | 'json'> & { statusCode?: number };
  let mockRequest: Partial<Request> & { traceId?: string };
  let mockHost: ArgumentsHost;
  let mockLogger: jest.Mocked<AppLoggerService>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    filter = new AllExceptionsFilter(mockLogger);

    const partialResponse: Partial<Response> & { statusCode?: number } = {
      status: jest.fn(function (
        this: Response & { statusCode?: number },
        code: number,
      ) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    mockResponse = partialResponse as Response & { statusCode?: number };
    mockRequest = { url: '/test', traceId: 'trace-123' };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest as Request,
      }),
    } as unknown as ArgumentsHost;
  });

  describe('DomainError handling', () => {
    it('handles DomainError with BAD_REQUEST code', () => {
      const ex = new DomainError('Invalid input', 'BAD_REQUEST');
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Invalid input',
        }),
      );
    });

    it('handles NOT_FOUND DomainError', () => {
      const ex = new DomainError('Test not found', 'NOT_FOUND');
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: 'Test not found' }),
      );
    });

    it('logs server errors via logger.error for 5xx', () => {
      const ex = new DomainError('DB failure', 'INTERNAL_ERROR');
      filter.catch(ex, mockHost);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Domain error'),
        expect.any(String),
      );
    });

    it('logs client errors via logger.warn for 4xx', () => {
      const ex = new DomainError('bad input', 'BAD_REQUEST');
      filter.catch(ex, mockHost);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Domain error'),
      );
    });

    it('includes code when DomainError has E_UNIQUE_CONSTRAINT', () => {
      const ex = new DomainError(
        '"email" already exists',
        'E_UNIQUE_CONSTRAINT',
      );
      filter.catch(ex, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          code: 'E_UNIQUE_CONSTRAINT',
        }),
      );
    });

    it('maps DomainError with no code to 500', () => {
      const ex = new DomainError('no-code error');
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'no-code error',
        }),
      );
    });

    it('maps INVALID_STATE code to 400', () => {
      const ex = new DomainError('invalid state', 'INVALID_STATE');
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'invalid state',
        }),
      );
    });

    it('maps FORBIDDEN code to 403', () => {
      const ex = new DomainError(
        'PDF does not belong to this test',
        'FORBIDDEN',
      );
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: 'PDF does not belong to this test',
        }),
      );
    });

    it('maps SIDECAR_ERROR code to 502', () => {
      const ex = new DomainError('PDF sidecar unavailable', 'SIDECAR_ERROR');
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(502);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 502,
          message: 'PDF sidecar unavailable',
        }),
      );
    });

    it('uses no-trace-id fallback when neither RequestContext nor request has traceId', () => {
      mockRequest.traceId = undefined;

      const ex = new DomainError('missing', 'NOT_FOUND');
      filter.catch(ex, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'no-trace-id',
        }),
      );
    });
  });

  describe('Prisma error handling', () => {
    it('maps P2002 to 409 with code', () => {
      const ex = new Prisma.PrismaClientKnownRequestError('fail', {
        code: 'P2002',
        clientVersion: '1.0.0',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          code: 'E_UNIQUE_CONSTRAINT',
        }),
      );
    });

    it('maps P2025 to 404 with code', () => {
      const ex = new Prisma.PrismaClientKnownRequestError('fail', {
        code: 'P2025',
        clientVersion: '1.0.0',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'E_RECORD_NOT_FOUND',
        }),
      );
    });

    it('maps unknown Prisma code to 500 with error log', () => {
      const ex = new Prisma.PrismaClientKnownRequestError('fail', {
        code: 'P9999',
        clientVersion: '1.0.0',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
        }),
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled Prisma error'),
        expect.any(String),
      );
    });

    it('logs a handled Prisma 4xx at warn like every other 4xx', () => {
      const ex = new Prisma.PrismaClientKnownRequestError('fail', {
        code: 'P2002',
        clientVersion: '1.0.0',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unique constraint failed'),
      );
    });

    it('uses no-trace-id fallback for Prisma errors when traceId is missing', () => {
      mockRequest.traceId = undefined;

      const ex = new Prisma.PrismaClientKnownRequestError('fail', {
        code: 'P2002',
        clientVersion: '1.0.0',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'no-trace-id' }),
      );
    });
  });

  describe('HTTP exception handling', () => {
    it('returns 404 for NotFoundException', () => {
      const ex = new NotFoundException('Not found');
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          message: 'Not found',
          traceId: 'trace-123',
        }),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Client error'),
      );
    });

    it('maps validation errors to 422 with errors array', () => {
      const ex = new BadRequestException({
        message: ['name: must not be empty'],
        error: 'Bad Request',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 422,
          message: 'Validation failed',
          errors: [{ field: 'name', messages: ['must not be empty'] }],
          traceId: 'trace-123',
        }),
      );
    });

    it('does not rewrite a non-400 status to 422 when the message is an array', () => {
      const ex = new NotFoundException({
        message: ['not: found'],
        error: 'Not Found',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          message: 'not: found',
        }),
      );
    });

    it('handles BadRequestException with single message string', () => {
      const ex = new BadRequestException('Invalid payload');
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Invalid payload',
          path: '/test',
          traceId: 'trace-123',
        }),
      );
    });

    it('handles ConflictException with details', () => {
      const ex = new ConflictException('Resource already exists');
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          message: 'Resource already exists',
          traceId: 'trace-123',
        }),
      );
    });

    it('defaults to Request failed when response object has no message', () => {
      const ex = new HttpException({ error: 'Custom error' }, 400);
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Request failed',
          path: '/test',
          traceId: 'trace-123',
        }),
      );
    });

    it('handles response object with non-string, non-array message', () => {
      const ex = new HttpException({ message: 42 }, 400);
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Request failed',
        }),
      );
    });

    it('handles response object with message but no error property', () => {
      const ex = new HttpException({ message: 'Something failed' }, 400);
      filter.catch(ex, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Something failed',
        }),
      );
    });

    it('parses validation messages without a field prefix into empty field', () => {
      const ex = new BadRequestException({
        message: ['viewport must be a string'],
        error: 'Bad Request',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 422,
          message: 'Validation failed',
          errors: [{ field: '', messages: ['viewport must be a string'] }],
        }),
      );
    });

    it('preserves structured body fields for HttpException custom bodies', () => {
      const healthBody = {
        status: 'unhealthy',
        results: { database: 'down' },
        checks: { database: { status: 'error' } },
      };
      const ex = new HttpException(healthBody, HttpStatus.SERVICE_UNAVAILABLE);
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          status: 'unhealthy',
          results: { database: 'down' },
          checks: { database: { status: 'error' } },
        }),
      );
    });

    it('renders Request failed for structured bodies without a message', () => {
      const ex = new HttpException(
        { status: 503, details: { db: 'up' } },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          message: 'Request failed',
          details: { db: 'up' },
        }),
      );
    });

    it('keeps envelope keys intact when the structured body has no statusCode', () => {
      const ex = new HttpException({ status: 'degraded', uptime: 42 }, 503);
      filter.catch(ex, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          timestamp: expect.any(String),
          path: '/test',
          traceId: 'trace-123',
          status: 'degraded',
          uptime: 42,
        }),
      );
    });

    it('does not let the exception body override the envelope statusCode', () => {
      const ex = new HttpException({ statusCode: 999, status: 'weird' }, 503);
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 503 }),
      );
    });

    it('handles HttpException with object response containing string message', () => {
      const ex = new BadRequestException({
        message: 'Invalid input',
        error: 'Bad Request',
      });
      filter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Invalid input',
        }),
      );
    });

    it('logs 5xx errors via logger.error', () => {
      const ex = new HttpException('Server error', 500);
      filter.catch(ex, mockHost);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Http server error'),
        expect.any(String),
      );
    });

    it('logs handled exceptions with status < 400 as info', () => {
      const ex = new HttpException('Redirect', 302);
      filter.catch(ex, mockHost);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Handled exception'),
      );
    });

    it('uses no-trace-id fallback for HttpException when traceId is missing', () => {
      mockRequest.traceId = undefined;

      const ex = new NotFoundException('Not found');
      filter.catch(ex, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'no-trace-id' }),
      );
    });
  });

  describe('Multer error handling', () => {
    it('maps Multer LIMIT_FILE_SIZE to 413', () => {
      const multerError = {
        name: 'MulterError',
        code: 'LIMIT_FILE_SIZE',
        message: 'File too large',
      };
      filter.catch(multerError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(413);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 413,
          message: expect.any(String),
        }),
      );
    });

    it('treats other Multer codes as generic 500', () => {
      const multerError = {
        name: 'MulterError',
        code: 'LIMIT_UNEXPECTED_FILE',
        message: 'Unexpected field',
      };
      filter.catch(multerError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Unknown exception handling', () => {
    it('returns 500 for generic Error', () => {
      filter.catch(new Error('Unexpected failure'), mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
        }),
      );
    });

    it('returns 500 for unknown exception', () => {
      filter.catch('string error', mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
        }),
      );
    });

    it('uses no-trace-id fallback for unknown exceptions when traceId missing', () => {
      mockRequest.traceId = undefined;

      filter.catch(new Error('fail'), mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'no-trace-id' }),
      );
    });
  });
});
