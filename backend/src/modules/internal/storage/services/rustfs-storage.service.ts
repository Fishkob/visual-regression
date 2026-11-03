import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AppConfigService } from '@config/app-config.service';
import {
  retry,
  exponentialBackoffMs,
} from '@common/infrastructure/retry-policy';
import { DomainError } from '@common/domain/domain-error';
import { withTimeout as withTimeoutHelper } from '@common/utils/with-timeout';
import type {
  IStorageProvider,
  StorageObjectMetadata,
  StorageUploadResult,
} from '@common/domain/storage-provider.interface';
import { StorageObjectName } from './storage-object-name';
import { S3Presigner } from './s3-presigner';
import * as mime from 'mime-types';

const RUSTFS_OPERATION_TIMEOUT_MS = 30_000;
const DELETE_CONCURRENCY = 10;

@Injectable()
export class RustFsStorageService
  implements IStorageProvider, OnModuleInit, OnModuleDestroy
{
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly presigner: S3Presigner;
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly logger: AppLoggerService,
    private readonly appConfig: AppConfigService,
    private readonly objectNames: StorageObjectName,
  ) {
    const {
      endpoint,
      port,
      useSsl: isSslEnabled,
      accessKey,
      secretKey,
      publicUrl,
    } = this.appConfig.rustfs;
    this.bucket = this.appConfig.rustfs.bucket;

    this.client = new S3Client({
      endpoint: `${isSslEnabled ? 'https' : 'http'}://${endpoint}:${port}`,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    // The browser talks to RUSTFS_PUBLIC_URL, not the internal endpoint, so the
    // presigned host must come from the public URL.
    this.presigner = new S3Presigner({ publicUrl, accessKey, secretKey });

    this.logger.log('Initialized RustFsStorageService', {
      endpoint,
      bucket: this.bucket,
      useSSL: isSslEnabled,
    });
  }

  // Provision the bucket (and the anonymous-read policy) at startup so the
  // storage health check passes before the first upload. Bucket creation used
  // to be an init container in compose; without eager provisioning the
  // /health/storage probe reports the bucket as missing until an upload
  // happens, which breaks readiness gates in CI.
  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  private withTimeout<T>(
    operationName: string,
    operation: Promise<T>,
    timeoutMs: number = RUSTFS_OPERATION_TIMEOUT_MS,
    onTimeout?: () => void,
  ): Promise<T> {
    return withTimeoutHelper(
      operation,
      timeoutMs,
      () => {
        return new DomainError(
          `RustFS ${operationName} timed out after ${timeoutMs}ms`,
          'INTERNAL_ERROR',
        );
      },
      onTimeout,
    );
  }

  // A timeout alone only rejects the caller — the underlying RustFS stream keeps
  // draining into memory and holds the connection. This variant hands the
  // stream to the work and destroys it when the timeout fires, so a slow read
  // actually stops instead of piling up buffered chunks.
  private withStreamTimeout<T>(
    operationName: string,
    work: (onStream: (stream: { destroy?: () => void }) => void) => Promise<T>,
    timeoutMs: number = RUSTFS_OPERATION_TIMEOUT_MS,
  ): Promise<T> {
    let stream: { destroy?: () => void } | undefined;
    return this.withTimeout(
      operationName,
      work((s) => {
        stream = s;
      }),
      timeoutMs,
      () => stream?.destroy?.(),
    );
  }

  async putObject(
    filename: string,
    buffer: Buffer,
    mimeType?: string,
  ): Promise<string> {
    await this.ensureBucket();
    const { maxAttempts, retryDelayMs } = this.appConfig.storageRetry;
    // Retry-all: putObject is idempotent, so re-attempting every failure
    // (incl. permanent config errors) is safe — the original S3 error is
    // logged in putObjectInternal and surfaces as a 500 after retries.
    return retry(() => this.putObjectInternal(filename, buffer, mimeType), {
      maxAttempts,
      // attempt is 1-indexed; subtract 1 so the first retry waits the configured
      // base (2^0 × base) instead of 2× it.
      backoffMs: (attempt) => exponentialBackoffMs(attempt - 1, retryDelayMs),
      isRetryable: () => true,
    });
  }

  async get(url: string): Promise<Buffer> {
    const objectName = this.objectNames.fromUrl(url);
    if (!objectName) {
      throw new DomainError(
        'Invalid image URL — cannot extract object name',
        'BAD_REQUEST',
      );
    }
    try {
      return await this.withStreamTimeout('get', (onStream) =>
        this.readObject(objectName, onStream),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to get object ${objectName}`,
        err instanceof Error ? err.stack : String(err),
        { bucket: this.bucket },
      );
      if (this.isMissingObjectError(err)) {
        throw new DomainError('Object not found in storage', 'NOT_FOUND');
      }
      throw new DomainError(
        `Image retrieval failed: ${detail}`,
        'INTERNAL_ERROR',
      );
    }
  }

  private async readObject(
    objectName: string,
    onStream: (stream: { destroy?: () => void }) => void,
  ): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectName }),
    );
    const stream = response.Body as unknown as AsyncIterable<Uint8Array> & {
      destroy?: () => void;
    };
    onStream(stream);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(url: string): Promise<void> {
    const objectName = this.objectNames.fromUrl(url);
    if (!objectName) {
      throw new DomainError(
        'Invalid image URL — cannot extract object name',
        'BAD_REQUEST',
      );
    }

    try {
      await this.withTimeout(
        'delete',
        this.client.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: objectName }),
        ),
      );
      this.logger.log(`Deleted image ${objectName} from bucket ${this.bucket}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to delete image by URL`,
        err instanceof Error ? err.stack : String(err),
        { imageUrl: url },
      );
      throw new DomainError(
        `Image deletion failed: ${detail}`,
        'INTERNAL_ERROR',
      );
    }
  }

  async deleteQuietly(url: string): Promise<void> {
    await this.delete(url).catch(() => undefined);
  }

  async deletePrefix(prefix: string): Promise<number> {
    // The list phase is bounded like every other RustFS call: a hung list
    // otherwise leaves the maintenance task's advisory lock held
    // forever (see withCronJob) and silently skips every future run.
    const objects = await this.withTimeout(
      'listObjects',
      this.collectObjectNames(prefix),
    );
    if (objects.length === 0) return 0;
    await this.withTimeout('deletePrefix', this.deleteObjectsChunked(objects));
    this.logger.log(`Deleted ${objects.length} objects with prefix ${prefix}`);
    return objects.length;
  }

  async listObjectsWithLastModified(
    prefix: string,
    timeoutMs: number = RUSTFS_OPERATION_TIMEOUT_MS,
  ): Promise<StorageObjectMetadata[]> {
    return this.withTimeout(
      'listObjects',
      this.collectObjectMetadata(prefix),
      timeoutMs,
    );
  }

  private async deleteObjectsChunked(keys: string[]): Promise<void> {
    // S3 caps a single DeleteObjects request at 1000 keys.
    const MAX_KEYS_PER_REQUEST = 1000;
    for (let i = 0; i < keys.length; i += MAX_KEYS_PER_REQUEST) {
      const chunk = keys.slice(i, i + MAX_KEYS_PER_REQUEST);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: chunk.map((key) => ({ Key: key })) },
        }),
      );
    }
  }

  private async collectObjectNames(prefix: string): Promise<string[]> {
    const objects: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const item of response.Contents ?? []) {
        if (item.Key) objects.push(item.Key);
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return objects;
  }

  private async collectObjectMetadata(
    prefix: string,
  ): Promise<StorageObjectMetadata[]> {
    const objects: StorageObjectMetadata[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const item of response.Contents ?? []) {
        if (item.Key) {
          objects.push({
            name: item.Key,
            lastModified: item.LastModified ?? null,
          });
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return objects;
  }

  async deleteAll(urls: string[]): Promise<StorageUploadResult> {
    const deleted: string[] = [];
    const failed: { url: string; error: string }[] = [];

    let index = 0;
    const workerCount = Math.min(DELETE_CONCURRENCY, urls.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (index < urls.length) {
        const url = urls[index++];
        try {
          await this.delete(url);
          deleted.push(url);
          this.logger.log(`Deleted screenshot ${url} from storage`);
        } catch (error) {
          failed.push({
            url,
            error: error instanceof Error ? error.message : String(error),
          });
          this.logger.error(
            `Failed to delete screenshot ${url} from storage: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    });
    await Promise.all(workers);

    return { deleted, failed };
  }

  async exists(url: string): Promise<boolean> {
    const objectName = this.objectNames.fromUrl(url);
    if (!objectName) return false;
    try {
      await this.withTimeout(
        'exists',
        this.client.send(
          new HeadObjectCommand({ Bucket: this.bucket, Key: objectName }),
        ),
      );
      return true;
    } catch (err) {
      if (this.isMissingObjectError(err)) return false;
      const detail = err instanceof Error ? err.message : String(err);
      throw new DomainError(
        `Failed to check object existence: ${detail}`,
        'INTERNAL_ERROR',
      );
    }
  }

  // The URL↔object-name encoding is the storage module's own domain knowledge —
  // consumers round-trip through the seam instead of importing StorageObjectName.
  toPublicUrl(objectName: string): string {
    return this.objectNames.toPublicUrl(objectName);
  }

  fromUrl(url: string): string | null {
    return this.objectNames.fromUrl(url);
  }

  signUrl(url: string, ttlSeconds?: number): string {
    // Already signed (e.g. a response re-signed by mistake): leave it alone.
    if (url.includes('X-Amz-Signature=')) return url;
    // A foreign URL is not ours to sign — returning it unchanged keeps the
    // caller's link working instead of corrupting it.
    const objectName = this.objectNames.fromUrl(url);
    if (!objectName) return url;
    return this.presigner.presignGet(
      this.bucket,
      objectName,
      ttlSeconds ?? this.appConfig.rustfs.signedUrlTtlSeconds,
    );
  }

  async healthCheck(): Promise<void> {
    const hasBucket = await this.withTimeout(
      'healthCheck',
      this.bucketExists(),
    );
    if (!hasBucket) {
      this.logger.error('Health check failed: bucket missing', undefined, {
        bucket: this.bucket,
      });
      throw new DomainError('Storage bucket missing', 'INTERNAL_ERROR');
    }
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= this.verifyBucket().catch((err: unknown) => {
      this.bucketReady = null;
      throw err;
    });
    return this.bucketReady;
  }

  private async verifyBucket(): Promise<void> {
    try {
      const hasBucket = await this.bucketExists();
      if (!hasBucket) {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Created missing bucket "${this.bucket}"`);
      } else {
        this.logger.debug(`Bucket "${this.bucket}" already exists`);
      }
      await this.ensurePublicReadPolicy();
    } catch (err) {
      this.logger.error(
        'Failed to verify or create bucket',
        err instanceof Error ? err.stack : String(err),
        { bucket: this.bucket },
      );
      throw new DomainError(
        'Failed to verify or create bucket',
        'INTERNAL_ERROR',
      );
    }
  }

  private async bucketExists(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch (err) {
      if (this.isMissingObjectError(err)) return false;
      throw err;
    }
  }

  // Replaces the former `mc anonymous set download` init step: the browser
  // loads screenshots straight from RustFS, so the bucket must allow anonymous
  // reads. Tolerates failure (logged as a warning) exactly like mc's `|| true`
  // did — a strict provider (e.g. AWS S3 with a public-access block) must be
  // configured out-of-band instead.
  private async ensurePublicReadPolicy(): Promise<void> {
    if (!this.appConfig.rustfs.ensurePublicBucket) return;
    try {
      await this.withTimeout(
        'setBucketPolicy',
        this.client.send(
          new PutBucketPolicyCommand({
            Bucket: this.bucket,
            Policy: this.publicReadPolicy(),
          }),
        ),
      );
      this.logger.log(`Bucket "${this.bucket}" is publicly readable`);
    } catch (err) {
      this.logger.warn(
        `Failed to set public-read policy on bucket "${this.bucket}"`,
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  private publicReadPolicy(): string {
    return JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    });
  }

  private isMissingObjectError(err: unknown): boolean {
    const e = err as {
      name?: string;
      code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      e?.name === 'NotFound' ||
      e?.name === 'NoSuchKey' ||
      e?.name === 'NoSuchBucket' ||
      e?.code === 'NotFound' ||
      e?.code === 'NoSuchKey' ||
      e?.$metadata?.httpStatusCode === 404
    );
  }

  private async putObjectInternal(
    filename: string,
    buffer: Buffer,
    mimeType?: string,
  ): Promise<string> {
    try {
      const lookup = mime.lookup;
      const lookupResult = lookup(filename);
      const contentType: string =
        mimeType ??
        (typeof lookupResult === 'string'
          ? lookupResult
          : 'application/octet-stream');

      await this.withTimeout(
        'upload',
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: filename,
            Body: buffer,
            ContentType: contentType,
          }),
        ),
      );

      const fileUrl = this.objectNames.toPublicUrl(filename);
      this.logger.log('Image uploaded successfully', {
        bucket: this.bucket,
        filename,
        fileUrl,
      });

      return fileUrl;
    } catch (err) {
      this.logger.error(
        `Failed to upload image ${filename}`,
        err instanceof Error ? err.stack : String(err),
        { bucket: this.bucket },
      );
      throw new DomainError('Image upload failed', 'INTERNAL_ERROR');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down RustFsStorageService...');
    try {
      this.client.destroy();
      this.logger.log('RustFS client connection closed');
    } catch (err) {
      this.logger.warn('RustFsStorageService shutdown failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
