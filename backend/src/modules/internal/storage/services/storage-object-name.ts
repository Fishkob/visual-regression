import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';

@Injectable()
export class StorageObjectName {
  private readonly publicUrl: string;
  private readonly bucket: string;

  constructor(appConfig: AppConfigService) {
    // Strip trailing slashes so a configured publicUrl ending in "/" does not
    // yield "host//bucket/..." URLs that are internally round-trippable but
    // non-canonical for CDNs/MIME routing.
    this.publicUrl = appConfig.rustfs.publicUrl.replace(/\/+$/, '');
    this.bucket = appConfig.rustfs.bucket;
  }

  // Public URLs round-trip through the storage layer: toPublicUrl builds a
  // fetchable URL, fromUrl recovers the exact object key for get/delete/exists.
  // Object keys are path-like (pdf-render/<base>/pagecount), so segments are
  // encoded individually — `/` stays a key separator while characters that
  // would corrupt a URL (#, ?, %, space) are percent-encoded on the way out
  // and decoded on the way back in.
  toPublicUrl(objectName: string): string {
    const encodedName = objectName
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${this.publicUrl}/${this.bucket}/${encodedName}`;
  }

  fromUrl(url: string): string | null {
    const prefix = `${this.publicUrl}/${this.bucket}/`;
    if (!url.startsWith(prefix)) return null;
    const encodedName = url.slice(prefix.length);
    try {
      return encodedName
        .split('/')
        .map((segment) => decodeURIComponent(segment))
        .join('/');
    } catch {
      // Malformed percent-encoding — the URL is not one we built.
      return null;
    }
  }
}
