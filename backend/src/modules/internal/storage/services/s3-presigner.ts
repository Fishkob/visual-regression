import { createHash, createHmac } from 'node:crypto';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
// SigV4 caps a presigned URL's lifetime at seven days.
const MAX_EXPIRY_SECONDS = 604_800;

export interface S3PresignerOptions {
  // The browser-reachable base (RUSTFS_PUBLIC_URL), which can differ from the
  // internal endpoint the backend talks to.
  publicUrl: string;
  accessKey: string;
  secretKey: string;
  region?: string;
}

// SigV4 query-string presigning for S3-compatible stores. Deliberately
// dependency-free (node:crypto only) and synchronous: the signature is a pure
// HMAC over the request, so signing never does I/O. The canonical-request rules
// follow the AWS SigV4 spec, including RFC 3986 encoding of every path segment
// and query value.
export class S3Presigner {
  private readonly base: URL;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly region: string;

  constructor(options: S3PresignerOptions) {
    this.base = new URL(options.publicUrl);
    this.accessKey = options.accessKey;
    this.secretKey = options.secretKey;
    this.region = options.region ?? 'us-east-1';
  }

  presignGet(
    bucket: string,
    objectName: string,
    ttlSeconds: number,
    now: Date = new Date(),
  ): string {
    const expires = clampExpiry(ttlSeconds);
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.region}/${SERVICE}/aws4_request`;
    const credential = `${this.accessKey}/${scope}`;

    const basePath = this.base.pathname.replace(/\/+$/, '');
    const canonicalUri = `${basePath}/${encodeRfc3986(bucket)}/${encodeObjectName(objectName)}`;
    const canonicalQuery = [
      ['X-Amz-Algorithm', ALGORITHM],
      ['X-Amz-Credential', credential],
      ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', String(expires)],
      ['X-Amz-SignedHeaders', 'host'],
    ]
      .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    const canonicalRequest = [
      'GET',
      canonicalUri,
      canonicalQuery,
      `host:${this.base.host}\n`,
      'host',
      UNSIGNED_PAYLOAD,
    ].join('\n');

    const stringToSign = [
      ALGORITHM,
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = hmacChain(`AWS4${this.secretKey}`, [
      dateStamp,
      this.region,
      SERVICE,
      'aws4_request',
    ]);
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    return `${this.base.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }
}

function clampExpiry(ttlSeconds: number): number {
  if (!Number.isFinite(ttlSeconds)) return MAX_EXPIRY_SECONDS;
  return Math.min(Math.max(Math.floor(ttlSeconds), 1), MAX_EXPIRY_SECONDS);
}

// RFC 3986: encodeURIComponent leaves !'()* unescaped, but SigV4 requires them
// percent-encoded.
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectName(objectName: string): string {
  return objectName.split('/').map(encodeRfc3986).join('/');
}

// 2026-10-25T01:02:03.456Z -> 20261025T010203Z
function formatAmzDate(now: Date): string {
  return now.toISOString().replace(/[-:]|\.\d{3}/g, '');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmacChain(initialKey: string, parts: string[]): Buffer {
  return parts.reduce<Buffer>(
    (key, part) => createHmac('sha256', key).update(part).digest(),
    Buffer.from(initialKey),
  );
}
