import { Injectable } from '@nestjs/common';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { BaselineRevisionRepository } from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import type { IStorageObjectReferencedness } from '@common/domain/storage-referencedness.interface';

// A single `IN (...)` over the bucket-wide candidate list can exceed
// PostgreSQL's 65535 bind-parameter ceiling, so each repository query is split
// into batches this size. The batch boundaries are an implementation detail;
// callers still see one merged, deduplicated result.
const URL_QUERY_CHUNK_SIZE = 2_000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

// Adapter that satisfies the storage-object referencedness seam. The referenced
// subset spans three repositories (screenshot content URLs, comparison diff
// URLs, and baseline revision URLs), so the union query and the reclaim filter
// live here — the maintenance module crosses the seam without importing any
// concrete public repository.
@Injectable()
export class StorageObjectReferencednessService implements IStorageObjectReferencedness {
  constructor(
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly revisions: BaselineRevisionRepository,
  ) {}

  async findReferencedUrls(urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];
    const perBatch = await Promise.all(
      chunk(urls, URL_QUERY_CHUNK_SIZE).map(async (batch) => {
        const [screenshotUrls, diffUrls, revisionUrls] = await Promise.all([
          this.screenshots.findReferencedImageUrls(batch),
          this.comparisons.findReferencedDiffUrls(batch),
          this.revisions.findReferencedUrls(batch),
        ]);
        return [...screenshotUrls, ...diffUrls, ...revisionUrls];
      }),
    );
    return [...new Set(perBatch.flat())];
  }

  async filterReclaimableUrls(urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];
    const perBatch = await Promise.all(
      chunk(urls, URL_QUERY_CHUNK_SIZE).map((batch) =>
        this.screenshots.filterReclaimableUrls(batch),
      ),
    );
    return [...new Set(perBatch.flat())];
  }
}
