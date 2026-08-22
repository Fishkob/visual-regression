import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  PDF_RENDER_CACHE,
  IPdfRenderCache,
} from '@common/domain/pdf-sidecar.interface';
import {
  PDF_RENDER_PREFIX,
  pdfRenderCacheBaseName,
  pdfSourceObjectName,
} from '@internal/pdf-sidecar/pdf-render-path';
import { AppLoggerService } from '@common/logging/app-logger.service';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { METRICS } from '@common/domain/metrics-catalog';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';

// The PDF render cache (rendered pages + page-count blobs) is keyed by the
// base name of the PDF it was rendered from and lives in MinIO under the
// `pdf-render/` namespace — it is not tracked in the DB. Eviction only happens
// on PDF approval, so PDFs retired by upload-supersede, test deletion, or
// variant deletion leave their render cache behind. This task sweeps the
// namespace and evicts any cache whose base PDF object no longer exists.
// The sweep lists the entire `pdf-render/` namespace (one rendered-page object
// per page plus a page-count blob per rendered PDF), which grows without bound
// while the base PDF exists — the same namespace size the bucket-wide
// UnreferencedObjectCleanupTask guards against with a 10-minute budget. Give
// the listing a maintenance-scale budget so the task sweeps instead of dying on
// the 30s per-operation cap; the per-page streaming stays bounded for the other
// callers that list a single namespace.
const PDF_RENDER_CACHE_LIST_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class PdfRenderCacheCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.pdfRenderCacheCleanup;
  readonly label = 'pdf render cache cleanup';

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @Inject(PDF_RENDER_CACHE) private readonly renderCache: IPdfRenderCache,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(): Promise<MaintenanceResult> {
    const objects = await this.storage.listObjectsWithLastModified(
      `${PDF_RENDER_PREFIX}/`,
      PDF_RENDER_CACHE_LIST_TIMEOUT_MS,
    );
    const baseNames = new Set(
      objects
        .map((object) => pdfRenderCacheBaseName(object.name))
        .filter((base): base is string => base !== null),
    );

    let evicted = 0;
    for (const baseName of baseNames) {
      // The render cache is keyed by the PDF object name minus its `.pdf`
      // extension; the owning PDF object is baseName + '.pdf'. Both the
      // existence probe and the eviction go through the source PDF's URL so the
      // URL→object-name bridge lives on the eviction seam, not here.
      const basePdfUrl = this.storage.toPublicUrl(
        pdfSourceObjectName(baseName),
      );
      if (await this.storage.exists(basePdfUrl)) continue;
      if (await this.renderCache.clearCache(basePdfUrl)) {
        evicted += 1;
        this.logger.log(`Evicted orphaned PDF render cache for "${baseName}"`);
      } else {
        this.logger.warn(
          `Failed to delete orphaned PDF render cache for "${baseName}"`,
        );
      }
    }

    return {
      counters: [{ name: METRICS.cleanupPdfRenderCacheTotal, value: evicted }],
      gauges: [
        {
          name: METRICS.cleanupPdfRenderCacheLastRun,
          value: Date.now(),
        },
      ],
    };
  }
}
