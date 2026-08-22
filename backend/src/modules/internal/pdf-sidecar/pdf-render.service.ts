import { Inject, Injectable } from '@nestjs/common';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { DomainError } from '@common/domain/domain-error';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  PDF_PAGE_RENDERER,
  IPdfPageRenderer,
} from '@common/domain/pdf-sidecar.interface';
import { PdfRenderCacheStore } from './pdf-render-cache-store';
import { pdfBaseName, pdfRenderPagePath } from './pdf-render-path';
import { KIND_MIME_TYPES } from '@common/domain/test-kind';

@Injectable()
export class PdfRenderService {
  constructor(
    private readonly renderCache: PdfRenderCacheStore,
    @Inject(PDF_PAGE_RENDERER) private readonly renderer: IPdfPageRenderer,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly logger: AppLoggerService,
  ) {}

  async renderPage(
    pdfUrl: string,
    page: number,
  ): Promise<{ imageUrl: string; pageCount: number }> {
    const objectName = this.storage.fromUrl(pdfUrl);
    if (!objectName) {
      throw new DomainError('Invalid PDF URL', 'NOT_FOUND');
    }

    const baseName = pdfBaseName(objectName);
    const pageCount = await this.renderCache.get(baseName);
    if (pageCount !== undefined) {
      const cachePath = pdfRenderPagePath(baseName, pageCount, page);
      const cacheUrl = this.storage.toPublicUrl(cachePath);
      const isCached = await this.storage.exists(cacheUrl);
      if (isCached) {
        return { imageUrl: cacheUrl, pageCount };
      }
    }

    const pdfBuffer = await this.storage.get(pdfUrl);

    const result = await this.renderer.renderPdfPage(pdfBuffer, page);

    const cachePath = pdfRenderPagePath(baseName, result.pageCount, page);
    await this.storage.putObject(
      cachePath,
      result.imageBuffer,
      KIND_MIME_TYPES.image,
    );

    await this.renderCache.set(baseName, result.pageCount);

    return {
      imageUrl: this.storage.toPublicUrl(cachePath),
      pageCount: result.pageCount,
    };
  }

  async clearCache(pdfUrl: string): Promise<boolean> {
    const objectName = this.storage.fromUrl(pdfUrl);
    if (!objectName) return false;
    const baseName = pdfBaseName(objectName);
    const didEvict = await this.renderCache.evict(baseName);
    if (!didEvict) {
      this.logger.warn('Failed to clear PDF render cache', { pdfUrl });
    }
    return didEvict;
  }
}
