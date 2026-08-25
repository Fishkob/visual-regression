import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppLoggerService } from '@common/logging/app-logger.service';

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_STACK_LENGTH = 10_000;

function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
}

function sanitizeString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = stripControlChars(value);
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

@Injectable()
export class LogIngestionService {
  constructor(private readonly logger: AppLoggerService) {}

  ingest(body: Record<string, unknown>, req: Request): void {
    const traceId =
      sanitizeString(
        req.headers['x-trace-id'] ??
          (typeof body.traceId === 'string' ? body.traceId : undefined),
        128,
      ) ?? 'no-trace';
    const message =
      sanitizeString(body.message, MAX_MESSAGE_LENGTH) ?? 'Frontend log event';
    // Whitelist only these keys — the body is untrusted input and must not be
    // spread into log records wholesale.
    const ctx: Record<string, unknown> = { traceId };

    if (body.stack) {
      this.logger.error(
        `[Frontend] ${message}`,
        sanitizeString(body.stack, MAX_STACK_LENGTH),
        ctx,
      );
    } else if (body.type === 'web-vital') {
      const name = sanitizeString(body.name, MAX_MESSAGE_LENGTH) ?? 'unknown';
      const value =
        typeof body.value === 'number'
          ? body.value
          : (sanitizeString(body.value, MAX_MESSAGE_LENGTH) ?? 'unknown');
      this.logger.debug({ ...ctx, name, value, type: 'web-vital' });
    } else {
      this.logger.warn(`[Frontend] ${message}`, ctx);
    }
  }
}
