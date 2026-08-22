import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { StorageModule } from '@internal/storage/storage.module';
import {
  PDF_PAGE_COUNTER,
  PDF_PAGE_RENDERER,
  PDF_RENDER_CACHE,
} from '@common/domain/pdf-sidecar.interface';
import { PDF_COMPARISON_ENGINE } from '@common/domain/comparison-engine.interface';
import { PdfSidecarClient } from './pdf-sidecar.client';
import { PdfRenderService } from './pdf-render.service';
import { PdfRenderCacheStore } from './pdf-render-cache-store';

@Module({
  imports: [AppConfigModule, StorageModule],
  providers: [
    PdfSidecarClient,
    { provide: PDF_PAGE_COUNTER, useExisting: PdfSidecarClient },
    { provide: PDF_PAGE_RENDERER, useExisting: PdfSidecarClient },
    { provide: PDF_COMPARISON_ENGINE, useExisting: PdfSidecarClient },
    PdfRenderService,
    { provide: PDF_RENDER_CACHE, useExisting: PdfRenderService },
    PdfRenderCacheStore,
  ],
  exports: [
    PDF_PAGE_COUNTER,
    PDF_PAGE_RENDERER,
    PDF_RENDER_CACHE,
    PDF_COMPARISON_ENGINE,
  ],
})
export class PdfSidecarModule {}
