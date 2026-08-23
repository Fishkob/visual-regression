import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PdfRenderCacheStore } from '@internal/pdf-sidecar/pdf-render-cache-store';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';

interface PdfRenderCacheStoreInternals {
  cache: Map<string, { value: number; timestamp: number }>;
  cacheOrder: string[];
  cacheMax: number;
  setInMemory(baseName: string, pageCount: number): void;
}

function internal(cache: PdfRenderCacheStore): PdfRenderCacheStoreInternals {
  return cache as unknown as PdfRenderCacheStoreInternals;
}

describe('PdfRenderCacheStore', () => {
  let cache: PdfRenderCacheStore;
  let storage: Mocked<IStorageProvider>;

  beforeEach(async () => {
    storage = createMock<IStorageProvider>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfRenderCacheStore,
        { provide: STORAGE_PROVIDER, useValue: storage },
      ],
    }).compile();

    cache = module.get(PdfRenderCacheStore);
  });

  describe('get', () => {
    it('returns cached value when within TTL', async () => {
      internal(cache).cache.set('report.pdf', {
        value: 5,
        timestamp: Date.now(),
      });
      internal(cache).cacheOrder.push('report.pdf');

      const result = await cache.get('report.pdf');

      expect(result).toBe(5);
      expect(storage.get).not.toHaveBeenCalled();
    });

    it('fetches from storage on cache miss', async () => {
      storage.get.mockResolvedValue(Buffer.from('12'));
      storage.toPublicUrl.mockReturnValue(
        'http://storage/pdf-render/report.pdf/pagecount',
      );

      const result = await cache.get('report.pdf');

      expect(result).toBe(12);
      expect(storage.get).toHaveBeenCalledWith(
        'http://storage/pdf-render/report.pdf/pagecount',
      );
    });

    it('caches value after fetching from storage', async () => {
      storage.get.mockResolvedValue(Buffer.from('8'));

      await cache.get('report.pdf');
      storage.get.mockClear();

      const result = await cache.get('report.pdf');

      expect(result).toBe(8);
      expect(storage.get).not.toHaveBeenCalled();
    });

    it('returns undefined when storage has no page count', async () => {
      storage.get.mockRejectedValue(
        new DomainError('Object not found in storage', 'NOT_FOUND'),
      );

      const result = await cache.get('report.pdf');

      expect(result).toBeUndefined();
    });

    it('propagates storage failures instead of reading them as cache misses', async () => {
      storage.get.mockRejectedValue(
        new DomainError('Storage down', 'INTERNAL_ERROR'),
      );

      await expect(cache.get('report.pdf')).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });

    it('returns undefined when stored value is 0', async () => {
      storage.get.mockResolvedValue(Buffer.from('0'));

      const result = await cache.get('report.pdf');

      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('stores in memory', async () => {
      storage.exists.mockResolvedValue(false);

      await cache.set('report.pdf', 15);

      const cached = internal(cache).cache.get('report.pdf')!;
      expect(cached.value).toBe(15);
      expect(cached.timestamp).toBeDefined();
    });

    it('persists to storage when not already stored', async () => {
      storage.exists.mockResolvedValue(false);

      await cache.set('report.pdf', 15);

      expect(storage.putObject).toHaveBeenCalledWith(
        'pdf-render/report.pdf/pagecount',
        Buffer.from('15'),
        'text/plain',
      );
    });

    it('overwrites the persisted page count when the file already exists', async () => {
      storage.exists.mockResolvedValue(true);

      await cache.set('report.pdf', 15);

      expect(storage.putObject).toHaveBeenCalledWith(
        'pdf-render/report.pdf/pagecount',
        Buffer.from('15'),
        'text/plain',
      );
    });
  });

  describe('evict', () => {
    it('removes from cache', async () => {
      internal(cache).cache.set('report.pdf', {
        value: 5,
        timestamp: Date.now(),
      });
      internal(cache).cacheOrder.push('report.pdf');
      storage.deletePrefix.mockResolvedValue(1);

      const result = await cache.evict('report.pdf');

      expect(result).toBe(true);
      expect(internal(cache).cache.has('report.pdf')).toBe(false);
      expect(internal(cache).cacheOrder).not.toContain('report.pdf');
    });

    it('deletes from storage', async () => {
      internal(cache).cache.set('report.pdf', {
        value: 5,
        timestamp: Date.now(),
      });
      internal(cache).cacheOrder.push('report.pdf');
      storage.deletePrefix.mockResolvedValue(1);

      const result = await cache.evict('report.pdf');

      expect(result).toBe(true);
      expect(storage.deletePrefix).toHaveBeenCalledWith(
        'pdf-render/report.pdf/',
      );
    });

    it('reports false when the prefix had nothing to delete', async () => {
      storage.deletePrefix.mockResolvedValue(0);

      const result = await cache.evict('report.pdf');

      expect(result).toBe(false);
      expect(storage.deletePrefix).toHaveBeenCalledWith(
        'pdf-render/report.pdf/',
      );
    });

    it('handles storage errors gracefully', async () => {
      internal(cache).cache.set('report.pdf', {
        value: 5,
        timestamp: Date.now(),
      });
      internal(cache).cacheOrder.push('report.pdf');
      storage.deletePrefix.mockRejectedValue(new Error('Storage error'));

      const result = await cache.evict('report.pdf');

      expect(result).toBe(false);
      expect(internal(cache).cache.has('report.pdf')).toBe(false);
      expect(internal(cache).cacheOrder).not.toContain('report.pdf');
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when cache exceeds max', async () => {
      internal(cache).cacheMax = 3;
      for (let i = 0; i < 3; i++) {
        internal(cache).cache.set(`doc-${i}`, {
          value: i,
          timestamp: Date.now(),
        });
        internal(cache).cacheOrder.push(`doc-${i}`);
      }

      internal(cache).setInMemory('doc-new', 99);

      expect(internal(cache).cache.has('doc-0')).toBe(false);
      expect(internal(cache).cache.has('doc-new')).toBe(true);
      expect(internal(cache).cacheOrder.length).toBe(3);
    });

    it('moves existing entry to end on re-set', async () => {
      internal(cache).cacheMax = 3;
      internal(cache).setInMemory('doc-a', 1);
      internal(cache).setInMemory('doc-b', 2);
      internal(cache).setInMemory('doc-c', 3);
      internal(cache).setInMemory('doc-a', 10);

      expect(internal(cache).cacheOrder).toEqual(['doc-b', 'doc-c', 'doc-a']);
      expect(internal(cache).cache.get('doc-a')!.value).toBe(10);
    });
  });

  describe('TTL expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('returns cached value before TTL expiry', async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      internal(cache).cache.set('report.pdf', {
        value: 5,
        timestamp: now,
      });

      vi.advanceTimersByTime(1_799_999);

      const result = await cache.get('report.pdf');
      expect(result).toBe(5);
    });

    it('refetches from storage after TTL expiry', async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      internal(cache).cache.set('report.pdf', {
        value: 5,
        timestamp: now,
      });
      internal(cache).cacheOrder.push('report.pdf');

      vi.advanceTimersByTime(1_800_001);
      storage.get.mockResolvedValue(Buffer.from('10'));

      const result = await cache.get('report.pdf');

      expect(result).toBe(10);
      expect(storage.get).toHaveBeenCalled();
    });
  });
});
