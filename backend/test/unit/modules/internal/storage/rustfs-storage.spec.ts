import { Test, TestingModule } from '@nestjs/testing';
import { RustFsStorageService } from '@internal/storage/services/rustfs-storage.service';
import { StorageObjectName } from '@internal/storage/services/storage-object-name';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AppConfigService } from '@config/app-config.service';
import { DomainError } from '@common/domain/domain-error';
import { createMockLogger } from '@test/utils/mocks';

const { mockClient } = vi.hoisted(() => ({
  mockClient: { send: vi.fn(), destroy: vi.fn() },
}));

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    constructor(public readonly config: Record<string, unknown>) {}
    send = mockClient.send;
    destroy = mockClient.destroy;
  }
  function makeCommand(name: string) {
    return class {
      readonly __name = name;
      constructor(public readonly input: Record<string, unknown>) {}
    };
  }
  return {
    S3Client: MockS3Client,
    CreateBucketCommand: makeCommand('CreateBucketCommand'),
    DeleteObjectCommand: makeCommand('DeleteObjectCommand'),
    DeleteObjectsCommand: makeCommand('DeleteObjectsCommand'),
    GetObjectCommand: makeCommand('GetObjectCommand'),
    HeadBucketCommand: makeCommand('HeadBucketCommand'),
    HeadObjectCommand: makeCommand('HeadObjectCommand'),
    ListObjectsV2Command: makeCommand('ListObjectsV2Command'),
    PutBucketPolicyCommand: makeCommand('PutBucketPolicyCommand'),
    PutObjectCommand: makeCommand('PutObjectCommand'),
  };
});

type MockCommand = { __name: string; input: Record<string, unknown> };

function sentCommands(name: string): MockCommand[] {
  return mockClient.send.mock.calls
    .map((call) => call[0] as MockCommand)
    .filter((cmd) => cmd.__name === name);
}

function sentCommand(name: string): MockCommand | undefined {
  return sentCommands(name)[0];
}

const mockLogger = createMockLogger();

const mockAppConfig = {
  storageRetry: { maxAttempts: 3, retryDelayMs: 100 },
  rustfs: {
    endpoint: 'localhost',
    port: 9000,
    useSsl: false,
    accessKey: 'rustfsadmin',
    secretKey: 'rustfsadmin',
    bucket: 'screenshots',
    publicUrl: 'http://localhost:9000',
    ensurePublicBucket: false,
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

    mockClient.send.mockReset();
    mockClient.destroy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('putObject', () => {
    it('uploads image successfully', async () => {
      mockClient.send.mockResolvedValue({});

      const result = await service.putObject(
        'test.png',
        Buffer.from('abc'),
        'image/png',
      );

      expect(sentCommand('HeadBucketCommand')?.input).toEqual({
        Bucket: 'screenshots',
      });
      expect(sentCommand('PutObjectCommand')?.input).toEqual({
        Bucket: 'screenshots',
        Key: 'test.png',
        Body: Buffer.from('abc'),
        ContentType: 'image/png',
      });
      expect(result).toBe('http://localhost:9000/screenshots/test.png');
    });

    it('creates bucket if it does not exist', async () => {
      mockClient.send
        .mockRejectedValueOnce({ name: 'NotFound' })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await service.putObject(
        'new.png',
        Buffer.from('123'),
        'image/png',
      );

      expect(sentCommand('CreateBucketCommand')?.input).toEqual({
        Bucket: 'screenshots',
      });
      expect(result).toBe('http://localhost:9000/screenshots/new.png');
    });

    it('throws DomainError on upload failure', async () => {
      mockClient.send
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('upload failed'));

      await expect(
        service.putObject('fail.png', Buffer.from('123')),
      ).rejects.toThrow(DomainError);
    });

    it('falls back to octet-stream when mime lookup returns null', async () => {
      mockClient.send.mockResolvedValue({});

      await service.putObject('file.unknown_ext', Buffer.from('abc'));

      expect(sentCommand('PutObjectCommand')?.input).toEqual(
        expect.objectContaining({
          Key: 'file.unknown_ext',
          ContentType: 'application/octet-stream',
        }),
      );
    });

    it('uses the caller-provided mime type verbatim instead of re-deriving it from the filename', async () => {
      mockClient.send.mockResolvedValue({});

      await service.putObject(
        'document',
        Buffer.from('abc'),
        'application/pdf',
      );

      expect(sentCommand('PutObjectCommand')?.input).toEqual(
        expect.objectContaining({
          Key: 'document',
          ContentType: 'application/pdf',
        }),
      );
    });
  });

  describe('get', () => {
    it('extracts object name and returns the image buffer', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.send.mockResolvedValue({
        Body: (async function* () {
          yield Buffer.from('image-data');
        })(),
      });

      const result = await service.get(url);

      expect(sentCommand('GetObjectCommand')?.input).toEqual({
        Bucket: 'screenshots',
        Key: 'file.png',
      });
      expect(result).toEqual(Buffer.from('image-data'));
    });

    it('throws error if URL is invalid', async () => {
      const url = 'http://otherhost/not-valid.png';
      await expect(service.get(url)).rejects.toThrow(DomainError);
      expect(mockClient.send).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('extracts object name and deletes image', async () => {
      const url = 'http://localhost:9000/screenshots/delete-me.png';
      mockClient.send.mockResolvedValue({});

      await service.delete(url);

      expect(sentCommand('DeleteObjectCommand')?.input).toEqual({
        Bucket: 'screenshots',
        Key: 'delete-me.png',
      });
    });

    it('throws error if URL is invalid', async () => {
      const url = 'http://otherhost/not-valid.png';
      await expect(service.delete(url)).rejects.toThrow(DomainError);
    });

    it('throws error if deletion fails', async () => {
      const url = 'http://localhost:9000/screenshots/fail.png';
      mockClient.send.mockRejectedValue(new Error('oops'));

      await expect(service.delete(url)).rejects.toThrow(DomainError);
    });

    it('handles non-Error throws from delete', async () => {
      const url = 'http://localhost:9000/screenshots/fail.png';
      mockClient.send.mockRejectedValue('string error');

      await expect(service.delete(url)).rejects.toThrow(DomainError);
    });
  });

  describe('onModuleDestroy', () => {
    it('destroys the underlying client', async () => {
      await service.onModuleDestroy();
      expect(mockClient.destroy).toHaveBeenCalled();
    });

    it('handles destroy failure gracefully', async () => {
      mockClient.destroy.mockImplementation(() => {
        throw new Error('destroy failed');
      });
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'RustFsStorageService shutdown failed',
        { error: 'destroy failed' },
      );
    });
  });

  describe('ensureBucket error path', () => {
    it('throws DomainError when HeadBucket fails', async () => {
      mockClient.send.mockRejectedValue(new Error('connection refused'));

      await expect(
        service.putObject('test.png', Buffer.from('abc'), 'image/png'),
      ).rejects.toThrow(DomainError);
    });

    it('handles non-Error throws from HeadBucket', async () => {
      mockClient.send.mockRejectedValue('string error');

      await expect(
        service.putObject('test.png', Buffer.from('abc'), 'image/png'),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('get error path', () => {
    it('throws DomainError when getObject fails', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.send.mockRejectedValue(new Error('object not found'));

      await expect(service.get(url)).rejects.toThrow(DomainError);
    });

    it('handles non-Error throws from getObject', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.send.mockRejectedValue('string error');

      await expect(service.get(url)).rejects.toThrow(DomainError);
    });

    it('maps a missing object to a NOT_FOUND DomainError', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.send.mockRejectedValue({ name: 'NotFound' });

      await expect(service.get(url)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('maps an S3 NoSuchKey error to a NOT_FOUND DomainError', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.send.mockRejectedValue({ name: 'NoSuchKey' });

      await expect(service.get(url)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('keeps the underlying cause in the retrieval error', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.send.mockRejectedValue(new Error('connection reset'));

      await expect(service.get(url)).rejects.toThrow(/connection reset/);
    });

    it('keeps the underlying cause in the deletion error', async () => {
      const url = 'http://localhost:9000/screenshots/file.png';
      mockClient.send.mockRejectedValue(new Error('permission denied'));

      await expect(service.delete(url)).rejects.toThrow(/permission denied/);
    });
  });

  describe('deleteQuietly', () => {
    it('deletes the object without throwing on success', async () => {
      const url = 'http://localhost:9000/screenshots/quiet.png';
      mockClient.send.mockResolvedValue({});

      await expect(service.deleteQuietly(url)).resolves.toBeUndefined();

      expect(sentCommand('DeleteObjectCommand')?.input).toEqual({
        Bucket: 'screenshots',
        Key: 'quiet.png',
      });
    });

    it('swallows deletion failures instead of throwing', async () => {
      const url = 'http://localhost:9000/screenshots/quiet-fail.png';
      mockClient.send.mockRejectedValue(new Error('oops'));

      await expect(service.deleteQuietly(url)).resolves.toBeUndefined();
    });

    it('swallows invalid URL errors instead of throwing', async () => {
      await expect(
        service.deleteQuietly('http://otherhost/not-valid.png'),
      ).resolves.toBeUndefined();
    });
  });

  describe('deletePrefix', () => {
    it('lists objects under the prefix and removes them, returning the count', async () => {
      mockClient.send
        .mockResolvedValueOnce({
          Contents: [{ Key: 'pdf-render/a.png' }, { Key: 'pdf-render/b.png' }],
        })
        .mockResolvedValueOnce({});

      const result = await service.deletePrefix('pdf-render/');

      expect(sentCommand('ListObjectsV2Command')?.input).toEqual({
        Bucket: 'screenshots',
        Prefix: 'pdf-render/',
      });
      expect(sentCommand('DeleteObjectsCommand')?.input).toEqual({
        Bucket: 'screenshots',
        Delete: {
          Objects: [{ Key: 'pdf-render/a.png' }, { Key: 'pdf-render/b.png' }],
        },
      });
      expect(result).toBe(2);
    });

    it('skips the removal when nothing matches the prefix', async () => {
      mockClient.send.mockResolvedValueOnce({});

      const result = await service.deletePrefix('pdf-render/');

      expect(result).toBe(0);
      expect(sentCommand('DeleteObjectsCommand')).toBeUndefined();
    });
  });

  describe('url seam passthroughs', () => {
    it('maps an object name to its public url', () => {
      expect(service.toPublicUrl('pdfs/page.png')).toBe(
        'http://localhost:9000/screenshots/pdfs/page.png',
      );
    });

    it('extracts an object name from a public url', () => {
      expect(
        service.fromUrl('http://localhost:9000/screenshots/file.png'),
      ).toBe('file.png');
    });

    it('returns null for a url that does not belong to the bucket', () => {
      expect(service.fromUrl('http://otherhost/screenshots/file.png')).toBe(
        null,
      );
    });
  });

  describe('exists invalid url', () => {
    it('returns false without querying storage when the url is not parseable', async () => {
      const result = await service.exists('http://otherhost/not-valid.png');

      expect(result).toBe(false);
      expect(mockClient.send).not.toHaveBeenCalled();
    });
  });

  describe('deleteAll', () => {
    it('deletes all urls and returns deleted urls', async () => {
      mockClient.send.mockResolvedValue({});

      const result = await service.deleteAll([
        'http://localhost:9000/screenshots/file1.png',
        'http://localhost:9000/screenshots/file2.png',
      ]);

      expect(result.deleted).toEqual([
        'http://localhost:9000/screenshots/file1.png',
        'http://localhost:9000/screenshots/file2.png',
      ]);
      expect(result.failed).toEqual([]);
      expect(sentCommands('DeleteObjectCommand')).toHaveLength(2);
    });

    it('collects failed deletions separately', async () => {
      mockClient.send
        .mockResolvedValueOnce({})
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
      mockClient.send.mockImplementation(async () => {
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
      expect(sentCommands('DeleteObjectCommand')).toHaveLength(25);
      expect(peak).toBeLessThanOrEqual(10);
    });
  });

  describe('listObjectsWithLastModified', () => {
    it('returns object names with their lastModified stamp', async () => {
      mockClient.send.mockResolvedValueOnce({
        Contents: [
          { Key: 'candidate.png', LastModified: new Date('2026-01-01') },
          {
            Key: 'pdf-render/base/pagecount',
            LastModified: new Date('2026-01-02'),
          },
        ],
      });

      const result = await service.listObjectsWithLastModified('');

      expect(sentCommand('ListObjectsV2Command')?.input).toEqual({
        Bucket: 'screenshots',
        Prefix: '',
      });
      expect(result).toEqual([
        { name: 'candidate.png', lastModified: new Date('2026-01-01') },
        {
          name: 'pdf-render/base/pagecount',
          lastModified: new Date('2026-01-02'),
        },
      ]);
    });

    it('normalizes a missing lastModified to null', async () => {
      mockClient.send.mockResolvedValueOnce({
        Contents: [{ Key: 'no-age.png' }],
      });

      const result = await service.listObjectsWithLastModified('');

      expect(result).toEqual([{ name: 'no-age.png', lastModified: null }]);
    });

    it('returns empty array when nothing matches the prefix', async () => {
      mockClient.send.mockResolvedValueOnce({});

      const result = await service.listObjectsWithLastModified('');

      expect(result).toEqual([]);
    });
  });

  describe('exists', () => {
    it('returns true when the object exists', async () => {
      mockClient.send.mockResolvedValue({});

      const result = await service.exists(
        'http://localhost:9000/screenshots/file.png',
      );

      expect(result).toBe(true);
      expect(sentCommand('HeadObjectCommand')?.input).toEqual({
        Bucket: 'screenshots',
        Key: 'file.png',
      });
    });

    it('returns false when the object is missing', async () => {
      mockClient.send.mockRejectedValue({ name: 'NotFound' });

      const result = await service.exists(
        'http://localhost:9000/screenshots/file.png',
      );

      expect(result).toBe(false);
    });

    it('returns false for an S3 NoSuchKey error', async () => {
      mockClient.send.mockRejectedValue({ name: 'NoSuchKey' });

      const result = await service.exists(
        'http://localhost:9000/screenshots/file.png',
      );

      expect(result).toBe(false);
    });

    it('wraps non-missing errors in a DomainError', async () => {
      mockClient.send.mockRejectedValue(new Error('connection reset'));

      await expect(
        service.exists('http://localhost:9000/screenshots/file.png'),
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('operation timeout', () => {
    it('fails a hung get operation instead of hanging forever', async () => {
      vi.useFakeTimers();
      mockClient.send.mockReturnValue(new Promise(() => {}));

      const promise = service.get('http://localhost:9000/screenshots/file.png');
      const assertion = expect(promise).rejects.toThrow(/timed out/i);

      await vi.advanceTimersByTimeAsync(30_000);

      await assertion;
      vi.useRealTimers();
    });

    it('fails a hung delete operation instead of hanging forever', async () => {
      vi.useFakeTimers();
      mockClient.send.mockReturnValue(new Promise(() => {}));

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
        mockClient.send.mockResolvedValue({ Body: neverStream });

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

    it('fails a hung list operation instead of hanging forever', async () => {
      vi.useFakeTimers();
      mockClient.send.mockReturnValue(new Promise(() => {}));

      const promise = service.listObjectsWithLastModified('pdf-render/');
      const assertion = expect(promise).rejects.toThrow(/timed out/i);

      await vi.advanceTimersByTimeAsync(30_000);

      await assertion;
      vi.useRealTimers();
    });
  });

  describe('healthCheck', () => {
    it('verifies bucket exists without mutating', async () => {
      mockClient.send.mockResolvedValue({});

      await service.healthCheck();

      expect(sentCommand('HeadBucketCommand')?.input).toEqual({
        Bucket: 'screenshots',
      });
      expect(sentCommand('CreateBucketCommand')).toBeUndefined();
    });

    it('reports an error when the bucket is missing', async () => {
      mockClient.send.mockRejectedValue({ name: 'NotFound' });

      await expect(service.healthCheck()).rejects.toThrow(DomainError);
      expect(sentCommand('CreateBucketCommand')).toBeUndefined();
    });
  });

  describe('ensureBucket early-return', () => {
    it('reuses already checked bucket on second upload', async () => {
      mockClient.send.mockResolvedValue({});

      await service.putObject('first.png', Buffer.from('a'), 'image/png');
      await service.putObject('second.png', Buffer.from('b'), 'image/png');

      expect(sentCommands('HeadBucketCommand')).toHaveLength(1);
      expect(sentCommands('PutObjectCommand')).toHaveLength(2);
    });

    it('verifies the bucket only once under concurrent first uploads', async () => {
      mockClient.send.mockResolvedValue({});

      await Promise.all([
        service.putObject('first.png', Buffer.from('a'), 'image/png'),
        service.putObject('second.png', Buffer.from('b'), 'image/png'),
      ]);

      expect(sentCommands('HeadBucketCommand')).toHaveLength(1);
      expect(sentCommands('PutObjectCommand')).toHaveLength(2);
    });
  });

  describe('putObject with retry', () => {
    it('retries on transient upload failure', async () => {
      mockClient.send
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('transient error'))
        .mockResolvedValueOnce({});

      const result = await service.putObject(
        'retry.png',
        Buffer.from('test'),
        'image/png',
      );

      expect(sentCommands('PutObjectCommand')).toHaveLength(2);
      expect(result).toBe('http://localhost:9000/screenshots/retry.png');
    });

    it('throws after max retries', async () => {
      mockClient.send
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('persistent error'))
        .mockRejectedValueOnce(new Error('persistent error'))
        .mockRejectedValueOnce(new Error('persistent error'));

      await expect(
        service.putObject('fail.png', Buffer.from('test')),
      ).rejects.toThrow(DomainError);

      expect(sentCommands('PutObjectCommand')).toHaveLength(3);
    });

    it('uses exponential backoff between retries', async () => {
      vi.useFakeTimers();
      mockClient.send
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('t1'))
        .mockRejectedValueOnce(new Error('t2'))
        .mockResolvedValueOnce({});

      const promise = service.putObject(
        'exp.png',
        Buffer.from('test'),
        'image/png',
      );

      // With base 100ms exponential backoff, the first retry fires at
      // 2^0*100 = 100ms, the second at 2^1*100 = 200ms.
      await vi.advanceTimersByTimeAsync(100);
      expect(sentCommands('PutObjectCommand')).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(200);
      await expect(promise).resolves.toBe(
        'http://localhost:9000/screenshots/exp.png',
      );
      expect(sentCommands('PutObjectCommand')).toHaveLength(3);

      vi.useRealTimers();
    });

    it('handles non-Error throws from upload', async () => {
      mockClient.send
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce('string upload error');

      await expect(
        service.putObject('fail.png', Buffer.from('test')),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('deleteAll non-Error handling', () => {
    it('handles non-Error throws in deleteAll', async () => {
      mockClient.send.mockRejectedValue('string error');

      const result = await service.deleteAll([
        'http://localhost:9000/screenshots/file1.png',
      ]);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe(
        'Image deletion failed: string error',
      );
    });
  });

  describe('client configuration', () => {
    async function buildService(
      useSsl: boolean,
    ): Promise<RustFsStorageService> {
      const appConfig = {
        storageRetry: { maxAttempts: 3, retryDelayMs: 100 },
        rustfs: {
          endpoint: 'localhost',
          port: 9000,
          useSsl,
          accessKey: 'rustfsadmin',
          secretKey: 'rustfsadmin',
          bucket: 'screenshots',
          publicUrl: 'http://localhost:9000',
          ensurePublicBucket: false,
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

    function clientConfig(
      instance: RustFsStorageService,
    ): Record<string, unknown> {
      return (
        instance as unknown as { client: { config: Record<string, unknown> } }
      ).client.config;
    }

    it('uses an https endpoint when SSL is enabled', async () => {
      service = await buildService(true);

      expect(clientConfig(service).endpoint).toBe('https://localhost:9000');
      expect(clientConfig(service).forcePathStyle).toBe(true);
      expect(clientConfig(service).credentials).toEqual({
        accessKeyId: 'rustfsadmin',
        secretAccessKey: 'rustfsadmin',
      });
    });

    it('uses an http endpoint when SSL is disabled', async () => {
      service = await buildService(false);

      expect(clientConfig(service).endpoint).toBe('http://localhost:9000');
    });
  });

  describe('public-read bucket policy', () => {
    async function buildService(
      ensurePublicBucket: boolean,
    ): Promise<RustFsStorageService> {
      const appConfig = {
        storageRetry: { maxAttempts: 3, retryDelayMs: 100 },
        rustfs: {
          endpoint: 'localhost',
          port: 9000,
          useSsl: false,
          accessKey: 'rustfsadmin',
          secretKey: 'rustfsadmin',
          bucket: 'screenshots',
          publicUrl: 'http://localhost:9000',
          ensurePublicBucket,
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

    it('sets a public-read policy after verifying the bucket', async () => {
      service = await buildService(true);
      mockClient.send.mockResolvedValue({});

      await service.putObject('a.png', Buffer.from('a'), 'image/png');

      const policyCommand = sentCommand('PutBucketPolicyCommand');
      expect(policyCommand?.input.Bucket).toBe('screenshots');
      const policy = JSON.parse(policyCommand?.input.Policy as string);
      expect(policy.Statement[0].Action).toEqual(['s3:GetObject']);
      expect(policy.Statement[0].Resource).toEqual([
        'arn:aws:s3:::screenshots/*',
      ]);
    });

    it('tolerates policy failures and still uploads', async () => {
      service = await buildService(true);
      mockClient.send
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ name: 'AccessDenied' })
        .mockResolvedValueOnce({});

      await expect(
        service.putObject('a.png', Buffer.from('a'), 'image/png'),
      ).resolves.toBe('http://localhost:9000/screenshots/a.png');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('public-read policy'),
        expect.anything(),
      );
    });

    it('skips the policy when ensurePublicBucket is false', async () => {
      service = await buildService(false);
      mockClient.send.mockResolvedValue({});

      await service.putObject('a.png', Buffer.from('a'), 'image/png');

      expect(sentCommand('PutBucketPolicyCommand')).toBeUndefined();
    });
  });
});
