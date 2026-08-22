import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { DomainError } from '@common/domain/domain-error';
import {
  pdfRenderCachePrefix,
  pdfRenderPageCountPath,
} from './pdf-render-path';

@Injectable()
export class PdfRenderCacheStore {
  private readonly cache = new Map<
    string,
    { value: number; timestamp: number }
  >();
  private readonly cacheOrder: string[] = [];
  private readonly cacheMax = 500;
  private readonly cacheTTL = 1_800_000;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async get(baseName: string): Promise<number | undefined> {
    const cached = this.cache.get(baseName);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }

    const pageCountPath = pdfRenderPageCountPath(baseName);
    const stored = await this.readCachedPageCount(pageCountPath);
    if (stored > 0) {
      this.setInMemory(baseName, stored);
      return stored;
    }

    // A past-TTL entry whose count object is also gone is dead — drop it so
    // later gets don't re-read storage for a key that can never hit.
    this.removeInMemory(baseName);
    return undefined;
  }

  async set(baseName: string, pageCount: number): Promise<void> {
    this.setInMemory(baseName, pageCount);
    const pageCountPath = pdfRenderPageCountPath(baseName);
    await this.storage.putObject(
      pageCountPath,
      Buffer.from(String(pageCount)),
      'text/plain',
    );
  }

  // Evicts a base PDF's render cache. Returns whether the eviction reclaimed
  // anything in storage — a prefix that never existed (or was already evicted)
  // deletes zero objects and reports false, so callers counting evictions don't
  // over-report. The in-memory entry is dropped regardless.
  async evict(baseName: string): Promise<boolean> {
    this.cache.delete(baseName);
    const idx = this.cacheOrder.indexOf(baseName);
    if (idx !== -1) this.cacheOrder.splice(idx, 1);
    try {
      const deleted = await this.storage.deletePrefix(
        pdfRenderCachePrefix(baseName),
      );
      return deleted > 0;
    } catch {
      return false;
    }
  }

  private setInMemory(baseName: string, pageCount: number): void {
    if (this.cache.has(baseName)) {
      const idx = this.cacheOrder.indexOf(baseName);
      if (idx !== -1) this.cacheOrder.splice(idx, 1);
    }
    if (this.cacheOrder.length >= this.cacheMax) {
      const oldest = this.cacheOrder.shift();
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(baseName, {
      value: pageCount,
      timestamp: Date.now(),
    });
    this.cacheOrder.push(baseName);
  }

  private removeInMemory(baseName: string): void {
    this.cache.delete(baseName);
    const idx = this.cacheOrder.indexOf(baseName);
    if (idx !== -1) this.cacheOrder.splice(idx, 1);
  }

  private async readCachedPageCount(pageCountPath: string): Promise<number> {
    let buf: Buffer;
    try {
      buf = await this.storage.get(this.storage.toPublicUrl(pageCountPath));
    } catch (err) {
      // A missing count object is a cache miss; any other storage failure is a
      // real outage that must surface rather than silently degrade the render
      // path into re-rendering every page.
      if (err instanceof DomainError && err.code === 'NOT_FOUND') return 0;
      throw err;
    }
    return Number(buf.toString().trim()) || 0;
  }
}
