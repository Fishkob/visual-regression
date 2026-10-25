import type { Buffer } from 'node:buffer';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StorageUploadResult {
  deleted: string[];
  failed: { url: string; error: string }[];
}

export interface StorageObjectMetadata {
  name: string;
  lastModified: Date | null;
}

// The seam the public modules depend on. ADR-004 commits to swapping the
// S3-compatible provider, so consumers depend on this interface
// rather than the concrete adapter in `internal/storage`. The URL↔object-name
// encoding lives on this seam too — the storage module owns how object keys map
// to public URLs, so consumers round-trip through `toPublicUrl`/`fromUrl`
// instead of importing the concrete `StorageObjectName`.
export interface IStorageProvider {
  // Store an object under a name and return its public URL. Despite the name
  // being generic, this is the only write path in the seam — it carries
  // screenshots (image/PDF), diff artifacts, rendered page images, and the
  // pdf-sidecar page-count blobs.
  putObject(
    filename: string,
    buffer: Buffer,
    mimeType?: string,
  ): Promise<string>;
  get(url: string): Promise<Buffer>;
  // Best-effort delete for cleanup paths: must never throw, even on invalid
  // URLs or storage failures. Callers use this instead of `.catch(() => undefined)`.
  deleteQuietly(url: string): Promise<void>;
  // Best-effort prefix delete for cleanup paths: must never throw, even on
  // invalid prefixes or storage failures. Returns the number of objects
  // actually deleted so callers can distinguish "reclaimed something" from
  // "nothing was there" (deletePrefix on an empty prefix is a no-op success).
  deletePrefix(prefix: string): Promise<number>;
  deleteAll(urls: string[]): Promise<StorageUploadResult>;
  // Object names plus their last-modified stamp under a prefix. Used by the
  // unreferenced-object sweep so a retention window can be enforced before a
  // store→commit crash orphan is reclaimed. The whole-bucket sweep lists
  // everything, so the caller can raise the per-operation cap well above the
  // default 30s rather than dying on a realistically large bucket.
  listObjectsWithLastModified(
    prefix: string,
    timeoutMs?: number,
  ): Promise<StorageObjectMetadata[]>;
  exists(url: string): Promise<boolean>;
  healthCheck(): Promise<void>;
  // Public URLs round-trip through the storage layer: toPublicUrl builds a
  // fetchable URL from an object name, fromUrl recovers the exact object key
  // for get/delete/exists (null when the URL is not one this storage built).
  toPublicUrl(objectName: string): string;
  fromUrl(url: string): string | null;
  // Rewrites a stored URL into a time-limited presigned URL so a browser can
  // fetch the object directly from the store without a public-read bucket.
  // Synchronous by design (the signature is a local HMAC, never I/O) and
  // tolerant of foreign or already-presigned URLs, which are returned
  // unchanged. PDF render/download inputs must stay raw: the backend reads them
  // with `get`, which needs the canonical URL.
  signUrl(url: string, ttlSeconds?: number): string;
}
