import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppLoggerService } from '@common/logging/app-logger.service';

@Injectable()
export class LogIngestionService {
  constructor(private readonly logger: AppLoggerService) {}

  ingest(body: Record<string, unknown>, req: Request): void {
    const traceId =
      (req.headers['x-trace-id'] as string | undefined) ??
      (typeof body.traceId === 'string' ? body.traceId : undefined) ??
      'no-trace';
    const message =
      typeof body.message === 'string' ? body.message : 'Frontend log event';
    const ctx: Record<string, unknown> = { ...body, traceId };

    if (body.stack) {
      this.logger.error(
        `[Frontend] ${message}`,
        typeof body.stack === 'string' ? body.stack : undefined,
        ctx,
      );
    } else if (body.type === 'web-vital') {
      const name = typeof body.name === 'string' ? body.name : 'unknown';
      const value =
        typeof body.value === 'number'
          ? body.value
          : typeof body.value === 'string'
            ? body.value
            : 'unknown';
      this.logger.debug({ ...ctx, name, value, type: 'web-vital' });
    } else {
      this.logger.warn(`[Frontend] ${message}`, ctx);
    }
  }
}
