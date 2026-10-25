import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { DomainError } from '@common/domain/domain-error';
import { MAX_IMAGE_PIXELS } from '@config/upload-limits';

// JPEG/WebP are accepted at the edge and normalized to PNG before hashing and
// storage: the comparison engine and stored artifacts stay PNG-only, and an
// identical image in two formats dedupes to the same content hash.
@Injectable()
export class ImageNormalizer {
  async toPng(buffer: Buffer): Promise<Buffer> {
    try {
      const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS });
      const metadata = await image.metadata();
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > MAX_IMAGE_PIXELS
      ) {
        throw new DomainError(
          `Image exceeds the ${String(MAX_IMAGE_PIXELS)} pixel limit`,
          'BAD_REQUEST',
        );
      }
      return await image.png().toBuffer();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('Invalid image file', 'BAD_REQUEST');
    }
  }
}
