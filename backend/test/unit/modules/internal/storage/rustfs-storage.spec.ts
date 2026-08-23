import { Test, TestingModule } from '@nestjs/testing';
import { RustFsStorageService } from '@internal/storage/services/rustfs-storage.service';
import { StorageObjectName } from '@internal/storage/services/storage-object-name';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AppConfigService } from '@config/app-config.service';
import { DomainError } from '@common/domain/domain-error';
import { createMockLogger } from '@test/utils/mocks';
import { Client } from 'minio';
const { mockClient } = vi.hoisted(() => {
  const bucketExists = vi.fn();
  const makeBucket = vi.fn();
  const putObject = vi.fn();
  const removeObject = vi.fn();
  const getObject = vi.fn();
  const statObject = vi.fn();
  const listObjects = vi.fn();
  return {
    mockClient: {
      bucketExists,
      makeBucket,
      putObject,
      removeObject,
      getObject,
      statObject,
      listObjects,
    },
  };
});

vi.mock('minio', () => {
  const MockClient = vi.fn(function () {
    return mockClient;
  });
  return { Client: MockClient };
});

const mockLogger = createMockLogger();

const mockAppConfig = {
  storageRetry: { maxAttempts: 3, retryDelayMs: 100 },
  minio: {
    endpoint: 'localhost',
    port: 9000,
    useSsl: false,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    bucket: 'screenshots',
    publicUrl: 'http://localhost:9000',
  },
};

describe('RustFsStorageService', () => {
  let service: RustFsStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RustFsStorageService,
        StorageObjectName,
        { provide: AppLoggerService, useValue: mockLogger },
        { provide: AppConfigService, useValue: mockAppConfig },
      ],
    }).compile();

    service = module.get(RustFsStorageService);

    vi.clearAllMocks();
  });

  describe('putObject', () => {
    it('should upload image successfully', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject.mockResolvedValue(undefined);

      const result = await service.putObject(
        'test.png',
        Buffer.from('abc'),
        'image/png',
      );

      expect(mockClient.bucketExists).toHaveBeenCalledWith('screenshots');
      expect(mockClient.putObject).toHaveBeenCalled();
      expect(result).toBe('http://localhost:9000/screenshots/test.png');
    });

    it('should create bucket if it does not exist', async () => {
      mockClient.bucketExists.mockResolvedValue(false);
      mockClient.makeBucket.mockResolvedValue(undefined);
      mockClient.putObject.mockResolvedValue(undefined);

      const result = await service.putObject(
        'new.png',
        Buffer.from('123'),
        'image/png',
      );

      expect(mockClient.makeBucket).toHaveBeenCalledWith('screenshots');
      expect(result).toBe('http://localhost:9000/screenshots/new.png');
    });

    it('should throw DomainError on upload failure', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject.mockRejectedValue(new Error('upload failed'));

      await expect(
        service.putObject('fail.png', Buffer.from('123')),
      ).rejects.toThrow(DomainError);
    });

    it('should fallback to octet-stream when mime lookup returns null', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject.mockResolvedValue(undefined);

      await service.putObject('file.unknown_ext', Buffer.from('abc'));

      expect(mockClient.putObject).toHaveBeenCalledWith(
        'screenshots',
        'file.unknown_ext',
        Buffer.from('abc'),
        undefined,
        { 'Content-Type': 'application/octet-stream' },
      );
    });

    it('should use the caller-provided mime type verbatim instead of re-deriving it from the filename', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject.mockResolvedValue(undefined);

      await service.putObject(
        'document',
        Buffer.from('abc'),
        'application/pdf',
      );

      expect(mockClient.putObject).toHaveBeenCalledWith(
        'screenshots',
        'document',
        Buffer.from('abc'),
        undefined,
        { 'Content-Type': 'application/pdf' },
      );
    });
  });

  describe('get', () => {
    it('should extract object name and return the image buffer', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.getObject.mockResolvedValue(
        (async function* () {
          yield Buffer.from('image-data');
        })(),
      );

      const result = await service.get(url);

      expect(mockClient.getObject).toHaveBeenCalledWith(
        'screenshots',
        'file.png',
      );
      expect(result).toEqual(Buffer.from('image-data'));
    });

    it('should throw error if URL is invalid', async () => {
      const url = 'http://otherhost/not-valid.png';
      await expect(service.get(url)).rejects.toThrow(DomainError);
    });
  });

  describe('delete', () => {
    it('should extract object name and delete image', async () => {
      const url = 'http://localhost:9000/screenshots/delete-me.png';
      mockClient.removeObject.mockResolvedValue(undefined);

      await service.delete(url);

      expect(mockClient.removeObject).toHaveBeenCalledWith(
        'screenshots',
        'delete-me.png',
      );
    });

    it('should throw error if URL is invalid', async () => {
      const url = 'http://otherhost/not-valid.png';
      await expect(service.delete(url)).rejects.toThrow(DomainError);
    });

    it('should throw error if deletion fails', async () => {
      const url = 'http://localhost:9000/screenshots/fail.png';
      mockClient.removeObject.mockRejectedValue(new Error('oops'));

      await expect(service.delete(url)).rejects.toThrow(DomainError);
    });

    it('should handle non-Error throws from delete', async () => {
      const url = 'http://localhost:9000/screenshots/fail.png';
      mockClient.removeObject.mockRejectedValue('string error');

      await expect(service.delete(url)).rejects.toThrow(DomainError);
    });
  });

  describe('onModuleDestroy', () => {
    it('should call client.close when available', async () => {
      (mockClient as any).close = vi.fn().mockResolvedValue(undefined);
      await service.onModuleDestroy();
      expect((mockClient as any).close).toHaveBeenCalled();
      delete (mockClient as any).close;
    });

    it('should handle close failure gracefully', async () => {
      (mockClient as any).close = vi
        .fn()
        .mockRejectedValue(new Error('close failed'));
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'RustFsStorageService shutdown failed',
        { error: 'close failed' },
      );
      delete (mockClient as Record<string, unknown>).close;
    });

    it('should skip close when not available on client', async () => {
      if (typeof (mockClient as any).close === 'function') {
        delete (mockClient as any).close;
      }
      await service.onModuleDestroy();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Shutting down RustFsStorageService...',
      );
    });

    it('should handle close returning non-Promise value', async () => {
      (mockClient as any).close = vi.fn().mockReturnValue(undefined);
      await service.onModuleDestroy();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'RustFS client connection closed',
      );
      delete (mockClient as any).close;
    });

    it('should handle non-Error throws from close', async () => {
      (mockClient as any).close = vi.fn().mockRejectedValue('string error');
      await service.onModuleDestroy();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'RustFsStorageService shutdown failed',
        { error: 'string error' },
      );
      delete (mockClient as any).close;
    });
  });

  describe('ensureBucket error path', () => {
    it('should throw DomainError when bucketExists fails', async () => {
      mockClient.bucketExists.mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(
        service.putObject('test.png', Buffer.from('abc'), 'image/png'),
      ).rejects.toThrow(DomainError);
    });

    it('should handle non-Error throws from bucketExists', async () => {
      mockClient.bucketExists.mockRejectedValue('string error');

      await expect(
        service.putObject('test.png', Buffer.from('abc'), 'image/png'),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('get error path', () => {
    it('should throw DomainError when getObject fails', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.getObject.mockRejectedValue(new Error('object not found'));

      await expect(service.get(url)).rejects.toThrow(DomainError);
    });

    it('should handle non-Error throws from getObject', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.getObject.mockRejectedValue('string error');

      await expect(service.get(url)).rejects.toThrow(DomainError);
    });

    it('maps a missing object to a NOT_FOUND DomainError', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.getObject.mockRejectedValue({ code: 'NotFound' });

      await expect(service.get(url)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('maps an S3 NoSuchKey error to a NOT_FOUND DomainError', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.getObject.mockRejectedValue({ code: 'NoSuchKey' });

      await expect(service.get(url)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('keeps the underlying cause in the retrieval error', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.getObject.mockRejectedValue(new Error('connection reset'));

      await expect(service.get(url)).rejects.toThrow(/connection reset/);
    });

    it('keeps the underlying cause in the deletion error', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.removeObject.mockRejectedValue(new Error('permission denied'));

      await expect(service.delete(url)).rejects.toThrow(/permission denied/);
    });
  });

  describe('deleteQuietly', () => {
    it('deletes the object without throwing on success', async () => {
      const url = 'http://localhost:9000/screenshots/quiet.png';
      mockClient.removeObject.mockResolvedValue(undefined);

      await expect(service.deleteQuietly(url)).resolves.toBeUndefined();

      expect(mockClient.removeObject).toHaveBeenCalledWith(
        'screenshots',
        'quiet.png',
      );
    });

    it('swallows deletion failures instead of throwing', async () => {
      const url = 'http://localhost:9000/screenshots/quiet-fail.png';
      mockClient.removeObject.mockRejectedValue(new Error('oops'));

      await expect(service.deleteQuietly(url)).resolves.toBeUndefined();
    });

    it('swallows invalid URL errors instead of throwing', async () => {
      await expect(
        service.deleteQuietly('http://otherhost/not-valid.png'),
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteAll', () => {
    it('deletes all urls and returns deleted urls', async () => {
      mockClient.removeObject.mockResolvedValue(undefined);

      const result = await service.deleteAll([
        'http://localhost:9000/screenshots/file1.png',
        'http://localhost:9000/screenshots/file2.png',
      ]);

      expect(result.deleted).toEqual([
        'http://localhost:9000/screenshots/file1.png',
        'http://localhost:9000/screenshots/file2.png',
      ]);
      expect(result.failed).toEqual([]);
      expect(mockClient.removeObject).toHaveBeenCalledTimes(2);
    });

    it('collects failed deletions separately', async () => {
      mockClient.removeObject
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('permission denied'));

      const result = await service.deleteAll([
        'http://localhost:9000/screenshots/file1.png',
        'http://localhost:9000/screenshots/file2.png',
      ]);

      expect(result.deleted).toEqual([
        'http://localhost:9000/screenshots/file1.png',
      ]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].url).toBe(
        'http://localhost:9000/screenshots/file2.png',
      );
      expect(result.failed[0].error).toBe(
        'Image deletion failed: permission denied',
      );
    });

    it('handles empty urls array', async () => {
      const result = await service.deleteAll([]);

      expect(result.deleted).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('caps the number of concurrent deletions', async () => {
      let active = 0;
      let peak = 0;
      mockClient.removeObject.mockImplementation(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--;
      });

      const urls = Array.from(
        { length: 25 },
        (_, i) => `http://localhost:9000/screenshots/f${i}.png`,
      );

      const result = await service.deleteAll(urls);

      expect(result.deleted).toHaveLength(25);
      expect(mockClient.removeObject).toHaveBeenCalledTimes(25);
      expect(peak).toBeLessThanOrEqual(10);
    });
  });

  describe('listObjectsWithLastModified', () => {
    it('returns object names with their lastModified stamp', async () => {
      mockClient.listObjects.mockReturnValue(
        (async function* () {
          yield { name: 'candidate.png', lastModified: new Date('2026-01-01') };
          yield {
            name: 'pdf-render/base/pagecount',
            lastModified: new Date('2026-01-02'),
          };
          yield {};
        })(),
      );

      const result = await service.listObjectsWithLastModified('');

      expect(mockClient.listObjects).toHaveBeenCalledWith(
        'screenshots',
        '',
        true,
      );
      expect(result).toEqual([
        { name: 'candidate.png', lastModified: new Date('2026-01-01') },
        {
          name: 'pdf-render/base/pagecount',
          lastModified: new Date('2026-01-02'),
        },
      ]);
    });

    it('normalizes a missing lastModified to null', async () => {
      mockClient.listObjects.mockReturnValue(
        (async function* () {
          yield { name: 'no-age.png' };
        })(),
      );

      const result = await service.listObjectsWithLastModified('');

      expect(result).toEqual([{ name: 'no-age.png', lastModified: null }]);
    });

    it('returns empty array when nothing matches the prefix', async () => {
      mockClient.listObjects.mockReturnValue((async function* () {})());

      const result = await service.listObjectsWithLastModified('');

      expect(result).toEqual([]);
    });
  });

  describe('exists', () => {
    it('returns true when the object exists', async () => {
      mockClient.statObject.mockResolvedValue({ size: 100 });

      const result = await service.exists(
        'http://localhost:9000/screenshots/file.png',
      );

      expect(result).toBe(true);
      expect(mockClient.statObject).toHaveBeenCalledWith(
        'screenshots',
        'file.png',
      );
    });

    it('returns false when the object is missing', async () => {
      mockClient.statObject.mockRejectedValue({ code: 'NotFound' });

      const result = await service.exists(
        'http://localhost:9000/screenshots/file.png',
      );

      expect(result).toBe(false);
    });

    it('returns false for an S3 NoSuchKey error', async () => {
      mockClient.statObject.mockRejectedValue({ code: 'NoSuchKey' });

      const result = await service.exists(
        'http://localhost:9000/screenshots/file.png',
      );

      expect(result).toBe(false);
    });

    it('wraps non-missing errors in a DomainError', async () => {
      mockClient.statObject.mockRejectedValue(new Error('connection reset'));

      await expect(
        service.exists('http://localhost:9000/screenshots/file.png'),
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('operation timeout', () => {
    it('fails a hung get operation instead of hanging forever', async () => {
      vi.useFakeTimers();
      mockClient.getObject.mockReturnValue(new Promise(() => {}));

      const promise = service.get('http://localhost:9000/screenshots/file.png');
      const assertion = expect(promise).rejects.toThrow(/timed out/i);

      await vi.advanceTimersByTimeAsync(30_000);

      await assertion;
      vi.useRealTimers();
    });

    it('fails a hung delete operation instead of hanging forever', async () => {
      vi.useFakeTimers();
      mockClient.removeObject.mockReturnValue(new Promise(() => {}));

      const promise = service.delete(
        'http://localhost:9000/screenshots/file.png',
      );
      const assertion = expect(promise).rejects.toThrow(/timed out/i);

      await vi.advanceTimersByTimeAsync(30_000);

      await assertion;
      vi.useRealTimers();
    });

    it('destroys the underlying stream when a get operation times out', async () => {
      vi.useFakeTimers();
      try {
        const destroy = vi.fn();
        const neverStream = {
          destroy,
          [Symbol.asyncIterator]() {
            return { next: () => new Promise(() => {}) };
          },
        };
        mockClient.getObject.mockResolvedValue(neverStream as never);

        const promise = service.get(
          'http://localhost:9000/screenshots/file.png',
        );
        const assertion = expect(promise).rejects.toThrow(/timed out/i);

        await vi.advanceTimersByTimeAsync(30_000);

        await assertion;
        expect(destroy).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('destroys the underlying list stream when a list operation times out', async () => {
      vi.useFakeTimers();
      try {
        const destroy = vi.fn();
        const neverStream = {
          destroy,
          [Symbol.asyncIterator]() {
            return { next: () => new Promise(() => {}) };
          },
        };
        mockClient.listObjects.mockReturnValue(neverStream as never);

        const promise = service.listObjectsWithLastModified('pdf-render/');
        const assertion = expect(promise).rejects.toThrow(/timed out/i);

        await vi.advanceTimersByTimeAsync(30_000);

        await assertion;
        expect(destroy).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('healthCheck', () => {
    it('should verify bucket exists without mutating', async () => {
      mockClient.bucketExists.mockResolvedValue(true);

      await service.healthCheck();

      expect(mockClient.bucketExists).toHaveBeenCalledWith('screenshots');
      expect(mockClient.makeBucket).not.toHaveBeenCalled();
    });

    it('should report an error when the bucket is missing', async () => {
      mockClient.bucketExists.mockResolvedValue(false);

      await expect(service.healthCheck()).rejects.toThrow(DomainError);
      expect(mockClient.makeBucket).not.toHaveBeenCalled();
    });
  });

  describe('ensureBucket early-return', () => {
    it('should reuse already checked bucket on second upload', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject.mockResolvedValue(undefined);

      await service.putObject('first.png', Buffer.from('a'), 'image/png');
      await service.putObject('second.png', Buffer.from('b'), 'image/png');

      expect(mockClient.bucketExists).toHaveBeenCalledTimes(1);
      expect(mockClient.putObject).toHaveBeenCalledTimes(2);
    });

    it('should verify the bucket only once under concurrent first uploads', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject.mockResolvedValue(undefined);

      await Promise.all([
        service.putObject('first.png', Buffer.from('a'), 'image/png'),
        service.putObject('second.png', Buffer.from('b'), 'image/png'),
      ]);

      expect(mockClient.bucketExists).toHaveBeenCalledTimes(1);
      expect(mockClient.putObject).toHaveBeenCalledTimes(2);
    });
  });

  describe('putObject with retry', () => {
    it('should retry on transient upload failure', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject
        .mockRejectedValueOnce(new Error('transient error'))
        .mockResolvedValueOnce(undefined);

      const result = await service.putObject(
        'retry.png',
        Buffer.from('test'),
        'image/png',
      );

      expect(mockClient.putObject).toHaveBeenCalledTimes(2);
      expect(result).toBe('http://localhost:9000/screenshots/retry.png');
    });

    it('should throw after max retries', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject.mockRejectedValue(new Error('persistent error'));

      await expect(
        service.putObject('fail.png', Buffer.from('test')),
      ).rejects.toThrow(DomainError);

      expect(mockClient.putObject).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff between retries', async () => {
      vi.useFakeTimers();
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject
        .mockRejectedValueOnce(new Error('t1'))
        .mockRejectedValueOnce(new Error('t2'))
        .mockResolvedValueOnce(undefined);

      const promise = service.putObject(
        'exp.png',
        Buffer.from('test'),
        'image/png',
      );

      // With base 100ms exponential backoff, the first retry fires at
      // 2^0*100 = 100ms, the second at 2^1*100 = 200ms.
      await vi.advanceTimersByTimeAsync(100);
      expect(mockClient.putObject).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(200);
      await expect(promise).resolves.toBe(
        'http://localhost:9000/screenshots/exp.png',
      );
      expect(mockClient.putObject).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should handle non-Error throws from upload', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      mockClient.putObject.mockRejectedValue('string upload error');

      await expect(
        service.putObject('fail.png', Buffer.from('test')),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('deleteAll non-Error handling', () => {
    it('should handle non-Error throws in deleteAll', async () => {
      mockClient.removeObject.mockRejectedValue('string error');

      const result = await service.deleteAll([
        'http://localhost:9000/screenshots/file1.png',
      ]);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe(
        'Image deletion failed: string error',
      );
    });
  });

  describe('SSL config coercion', () => {
    async function buildService(
      useSsl: boolean,
    ): Promise<RustFsStorageService> {
      const appConfig = {
        storageRetry: { maxAttempts: 3, retryDelayMs: 100 },
        minio: {
          endpoint: 'localhost',
          port: 9000,
          useSsl,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
          bucket: 'screenshots',
          publicUrl: 'http://localhost:9000',
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RustFsStorageService,
          StorageObjectName,
          { provide: AppLoggerService, useValue: mockLogger },
          { provide: AppConfigService, useValue: appConfig },
        ],
      }).compile();
      return module.get(RustFsStorageService);
    }

    it('enables SSL when appConfig.minio.useSsl is true', async () => {
      await buildService(true);

      expect(vi.mocked(Client)).toHaveBeenCalledWith(
        expect.objectContaining({ useSSL: true }),
      );
    });

    it('disables SSL when appConfig.minio.useSsl is false', async () => {
      await buildService(false);

      expect(vi.mocked(Client)).toHaveBeenCalledWith(
        expect.objectContaining({ useSSL: false }),
      );
    });
  });
});
