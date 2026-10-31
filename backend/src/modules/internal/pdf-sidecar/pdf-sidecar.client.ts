import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import {
  exponentialBackoffMs,
  retry,
} from '@common/infrastructure/retry-policy';
import type {
  ComparisonResult,
  IComparisonEngine,
} from '@common/domain/comparison-engine.interface';
import { ENGINE_TOLERANCE } from '@common/domain/comparison-engine.interface';
import type {
  IPdfPageCounter,
  IPdfPageRenderer,
} from '@common/domain/pdf-sidecar.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AppConfigService } from '@config/app-config.service';

class SidecarHttpError extends DomainError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message, 'SIDECAR_ERROR');
    this.name = 'SidecarHttpError';
  }
}

function isTransientFailure(err: unknown): boolean {
  if (err instanceof SidecarHttpError) {
    return err.status >= 500;
  }
  if (err instanceof DomainError) return false;
  return true;
}

@Injectable()
export class PdfSidecarClient
  implements IComparisonEngine, IPdfPageCounter, IPdfPageRenderer
{
  readonly kind = 'pdf' as const;

  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(
    private readonly logger: AppLoggerService,
    appConfig: AppConfigService,
  ) {
    this.baseUrl = appConfig.pdfSidecar.url;
    this.timeout = appConfig.pdfSidecar.timeout;
  }

  async compare(expected: Buffer, actual: Buffer): Promise<ComparisonResult> {
    const form = new FormData();
    form.append(
      'expected',
      new Blob([new Uint8Array(expected)]),
      'expected.pdf',
    );
    form.append('actual', new Blob([new Uint8Array(actual)]), 'actual.pdf');
    form.append('threshold', String(ENGINE_TOLERANCE));

    return this.withRetry(
      'PDF sidecar compare retrying after transient failure',
      () => this.doCompare(form),
    );
  }

  async count(pdfBuffer: Buffer): Promise<number> {
    const form = new FormData();
    form.append('pdf', new Blob([new Uint8Array(pdfBuffer)]), 'document.pdf');

    return this.withRetry(
      'PDF sidecar count retrying after transient failure',
      () => this.doCount(form),
    );
  }

  async renderPdfPage(
    pdfBuffer: Buffer,
    page: number,
  ): Promise<{ imageBuffer: Buffer; pageCount: number }> {
    const form = new FormData();
    form.append('pdf', new Blob([new Uint8Array(pdfBuffer)]), 'document.pdf');
    form.append('page', String(page));

    return this.withRetry(
      'PDF sidecar render retrying after transient failure',
      () => this.doRenderPage(form, page),
      { page },
    );
  }

  private async doCompare(form: FormData): Promise<ComparisonResult> {
    const res = await this.post('/compare', form);

    const mismatchPages = this.parseCountHeader(
      res,
      'x-mismatch-count',
      '/compare',
    );
    const pageCount = this.parseCountHeader(res, 'x-page-count', '/compare');

    return {
      kind: 'pdf',
      mismatchPageCount: mismatchPages,
      pageCount,
      diffOutput: Buffer.from(await res.arrayBuffer()),
    };
  }

  private async doCount(form: FormData): Promise<number> {
    const res = await this.post('/count', form);
    return this.parseCountHeader(res, 'x-page-count', '/count');
  }

  // The sidecar must answer with a non-negative integer count on a 200. A
  // missing or non-numeric header is a contract breach, not a legitimate
  // "empty document": silently coercing it to 0 would turn a broken sidecar
  // into a fabricated zero-mismatch diff (or a comparison recorded against an
  // invented page count). Fail loud instead.
  private parseCountHeader(
    res: Response,
    header: string,
    endpoint: string,
  ): number {
    const raw = res.headers.get(header);
    if (raw === null) {
      throw new DomainError(
        `PDF sidecar ${endpoint} omitted ${header} header`,
        'SIDECAR_ERROR',
      );
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new DomainError(
        `PDF sidecar ${endpoint} returned invalid ${header}: "${raw}"`,
        'SIDECAR_ERROR',
      );
    }
    return parsed;
  }

  private async doRenderPage(
    form: FormData,
    page: number,
  ): Promise<{ imageBuffer: Buffer; pageCount: number }> {
    const res = await this.post('/render', form, { notFoundOn400: true, page });

    const pageCount = this.parseCountHeader(res, 'x-page-count', '/render');
    const imageBuffer = Buffer.from(await res.arrayBuffer());
    return { imageBuffer, pageCount };
  }

  // Shared fetch for the sidecar POST endpoints: throws a SidecarHttpError on
  // >=500 so the retry policy can distinguish transient failures, and a
  // permanent DomainError on 4xx. For the render endpoint a 400 carries
  // NOT_FOUND semantics (page out of range, or the upload was rejected) and may
  // carry the document page count in the error body.
  private async post(
    path: string,
    form: FormData,
    opts: { notFoundOn400?: boolean; page?: number } = {},
  ): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'unknown error');
      if (res.status >= 500) {
        this.logger.warn('PDF sidecar request failed', {
          path,
          status: res.status,
          errorBody,
        });
        throw new SidecarHttpError(
          res.status,
          `PDF sidecar ${path} returned ${res.status}: ${errorBody}`,
        );
      }
      if (res.status === 400 && opts.notFoundOn400) {
        let parsed: { error?: string; pageCount?: number };
        try {
          parsed = JSON.parse(errorBody) as {
            error?: string;
            pageCount?: number;
          };
        } catch {
          parsed = { error: errorBody };
        }
        if (parsed.pageCount) {
          throw new DomainError(
            `Page ${opts.page} exceeds document page count (${parsed.pageCount})`,
            'NOT_FOUND',
          );
        }
        throw new DomainError(parsed.error ?? errorBody, 'NOT_FOUND');
      }
      // A 4xx from the sidecar means the document was rejected (e.g. a
      // malformed PDF) — a permanent condition that job-level retry cannot fix.
      // 413 is the one case a user can act on, so it gets a limit-shaped
      // message instead of the internal route + raw body.
      if (res.status === 413) {
        throw new DomainError(
          'PDF is too large for comparison. Reduce the document size or split it.',
          'BAD_REQUEST',
        );
      }
      throw new DomainError(
        `PDF sidecar rejected ${path} (${res.status}): ${errorBody}`,
        res.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
      );
    }
    return res;
  }

  private withRetry<T>(
    message: string,
    fn: () => Promise<T>,
    context: Record<string, unknown> = {},
  ): Promise<T> {
    return retry(fn, {
      maxAttempts: 3,
      backoffMs: (attempt) => exponentialBackoffMs(attempt),
      isRetryable: isTransientFailure,
      onRetry: (err, attempt) => {
        this.logger.warn(message, { ...context, attempt, error: String(err) });
      },
    });
  }
}
