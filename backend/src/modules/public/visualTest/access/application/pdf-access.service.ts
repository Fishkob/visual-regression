import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { KIND_MIME_TYPES } from '@common/domain/test-kind';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  PDF_RENDER_CACHE,
  IPdfRenderCache,
} from '@common/domain/pdf-sidecar.interface';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import {
  Variant,
  type VariantFilter,
} from '@public/visualTest/core/domain/value-objects/variant.vo';

export type PdfDownloadType = 'baseline' | 'candidate' | 'diff';

// The PDF application seam: both the download and the page-render flows live
// here so the controller injects only application services, and the PDF
// ownership rule has a single call site. The name covers the whole surface —
// "download" alone would undersell the render flow.
@Injectable()
export class PdfAccessService {
  constructor(
    private readonly reviewRead: TestReadRepository,
    @Inject(PDF_RENDER_CACHE) private readonly pdfRenderCache: IPdfRenderCache,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async download(
    projectName: string,
    testName: string,
    type: string,
    filters?: VariantFilter,
    branchName?: string,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    Variant.resolveRequiredFilter(filters);

    const sources = await this.reviewRead.findPdfDownloadSources(
      projectName,
      testName,
      filters,
      branchName,
    );

    const url = this.resolveUrl(sources, type);
    if (!url) {
      throw new DomainError(`PDF not found for type "${type}"`, 'NOT_FOUND');
    }

    // findPdfDownloadSources resolves the variant's baseline/candidate/diff via
    // FKs that can point into another project or test (a cross-referenced
    // baseline row), so the query scoping alone does not prove ownership. Both
    // download and render go through the single assertPdfBelongsToTest owner —
    // one edit defines what counts as owned.
    await this.reviewRead.assertPdfBelongsToTest(
      projectName,
      testName,
      url,
      branchName,
    );

    const buffer = await this.storage.get(url);

    return {
      buffer,
      filename: `${testName}-${type}.pdf`,
      contentType: KIND_MIME_TYPES.pdf,
    };
  }

  async renderPdfPage(
    projectName: string,
    testName: string,
    pdfUrl: string,
    page: number,
    branchName?: string,
  ): Promise<{ imageUrl: string; signedImageUrl: string; pageCount: number }> {
    await this.reviewRead.assertPdfBelongsToTest(
      projectName,
      testName,
      pdfUrl,
      branchName,
    );
    const rendered = await this.pdfRenderCache.renderPage(pdfUrl, page);
    // The page image is browser-fetched, so it leaves the API twice: canonical
    // (identity) and presigned (render). The input pdfUrl above stays canonical
    // — it is a storage key for `get`.
    return {
      imageUrl: rendered.imageUrl,
      signedImageUrl: this.storage.signUrl(rendered.imageUrl),
      pageCount: rendered.pageCount,
    };
  }

  private resolveUrl(
    sources: {
      baselineUrl: string | null;
      candidateUrl: string | null;
      diffPdfUrl: string | null;
    } | null,
    type: string,
  ): string | null {
    if (!sources) return null;
    switch (type) {
      case 'baseline':
        return sources.baselineUrl;
      case 'candidate':
        return sources.candidateUrl;
      case 'diff':
        return sources.diffPdfUrl;
      default:
        throw new DomainError(
          `Invalid download type: "${type}"`,
          'BAD_REQUEST',
        );
    }
  }
}
