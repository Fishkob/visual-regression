import { Injectable } from '@nestjs/common';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import type { IStorageObjectReferencedness } from '@common/domain/storage-referencedness.interface';

// Adapter that satisfies the storage-object referencedness seam. The referenced
// subset spans two repositories (screenshot content URLs + comparison diff
// URLs), so the union query and the reclaim filter live here — the maintenance
// module crosses the seam without importing either concrete public repository.
@Injectable()
export class StorageObjectReferencednessService implements IStorageObjectReferencedness {
  constructor(
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
  ) {}

  async findReferencedUrls(urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];
    const [screenshotUrls, diffUrls] = await Promise.all([
      this.screenshots.findReferencedImageUrls(urls),
      this.comparisons.findReferencedDiffUrls(urls),
    ]);
    return [...new Set([...screenshotUrls, ...diffUrls])];
  }

  filterReclaimableUrls(urls: string[]): Promise<string[]> {
    return this.screenshots.filterReclaimableUrls(urls);
  }
}
