import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'minio';
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
import * as mime from 'mime-types';

const RUSTFS_OPERATION_TIMEOUT_MS = 30_000;
const DELETE_CONCURRENCY = 10;

@Injectable()
export class RustFsStorageService implements IStorageProvider, OnModuleDestroy {
  private readonly client: Client;
  private readonly bucket: string;
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
    } = this.appConfig.minio;
    this.bucket = this.appConfig.minio.bucket;

    this.client = new Client({
      endPoint: endpoint,
      port,
      useSSL: isSslEnabled,
      accessKey,
      secretKey,
    });

    this.logger.log('Initialized RustFsStorageService', {
      endpoint,
      bucket: this.bucket,
      useSSL: isSslEnabled,
    });
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
  // or list actually stops instead of piling up buffered chunks.
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
      const code = (err as { code?: string })?.code;
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to get object ${objectName}`,
        err instanceof Error ? err.stack : String(err),
        { bucket: this.bucket },
      );
      if (code === 'NotFound' || code === 'NoSuchKey') {
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
    const stream = await this.client.getObject(this.bucket, objectName);
    onStream(stream);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
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
        this.client.removeObject(this.bucket, objectName),
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
    // stream otherwise leaves the maintenance task's advisory lock held
    // forever (see withCronJob) and silently skips every future run. The list
    // stream is destroyed on timeout so a hung listing stops draining.
    const objects = await this.withStreamTimeout('listObjects', (onStream) =>
      this.collectObjectNames(prefix, onStream),
    );
    if (objects.length === 0) return 0;
    await this.withTimeout(
      'deletePrefix',
      this.client.removeObjects(this.bucket, objects),
    );
    this.logger.log(`Deleted ${objects.length} objects with prefix ${prefix}`);
    return objects.length;
  }

  async listObjectsWithLastModified(
    prefix: string,
    timeoutMs: number = RUSTFS_OPERATION_TIMEOUT_MS,
  ): Promise<StorageObjectMetadata[]> {
    return this.withStreamTimeout(
      'listObjects',
      (onStream) => this.collectObjectMetadata(prefix, onStream),
      timeoutMs,
    );
  }

  private async collectObjectNames(
    prefix: string,
    onStream: (stream: { destroy?: () => void }) => void,
  ): Promise<string[]> {
    const objectsList = this.client.listObjects(this.bucket, prefix, true);
    onStream(objectsList);
    const objects: string[] = [];
    for await (const obj of objectsList) {
      const item = obj as { name?: string };
      if (item.name) objects.push(item.name);
    }
    return objects;
  }

  private async collectObjectMetadata(
    prefix: string,
    onStream: (stream: { destroy?: () => void }) => void,
  ): Promise<StorageObjectMetadata[]> {
    const objectsList = this.client.listObjects(this.bucket, prefix, true);
    onStream(objectsList);
    const objects: StorageObjectMetadata[] = [];
    for await (const obj of objectsList) {
      const item = obj as { name?: string; lastModified?: Date | null };
      if (item.name) {
        objects.push({
          name: item.name,
          lastModified: item.lastModified ?? null,
        });
      }
    }
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
        this.client.statObject(this.bucket, objectName),
      );
      return true;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'NotFound' || code === 'NoSuchKey') return false;
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

  async healthCheck(): Promise<void> {
    const hasBucket = await this.withTimeout(
      'healthCheck',
      this.client.bucketExists(this.bucket),
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
      const hasBucket = await this.client.bucketExists(this.bucket);
      if (!hasBucket) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created missing bucket "${this.bucket}"`);
      } else {
        this.logger.debug(`Bucket "${this.bucket}" already exists`);
      }
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

  private async putObjectInternal(
    filename: string,
    buffer: Buffer,
    mimeType?: string,
  ): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const lookup = mime.lookup;
      const lookupResult = lookup(filename);
      const contentType: string =
        mimeType ??
        (typeof lookupResult === 'string'
          ? lookupResult
          : 'application/octet-stream');

      await this.withTimeout(
        'upload',
        this.client.putObject(this.bucket, filename, buffer, undefined, {
          'Content-Type': contentType,
        }),
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
      const clientWithClose = this.client as Partial<Client> & {
        close?: () => void | Promise<void>;
      };
      if (typeof clientWithClose.close === 'function') {
        const result = clientWithClose.close();
        if (result instanceof Promise) {
          await result;
        }
        this.logger.log('RustFS client connection closed');
      }
    } catch (err) {
      this.logger.warn('RustFsStorageService shutdown failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
