import { Injectable } from '@nestjs/common';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { DomainError } from '@common/domain/domain-error';
import { MAX_IMAGE_PIXELS } from '@config/upload-limits';
import { isPngSignature, readPngDimensions } from '@common/utils/png-header';
import { extractChangedRegions } from '@common/utils/changed-regions';
import {
  ComparisonResult,
  IComparisonEngine,
  ENGINE_TOLERANCE,
  type ImageComparisonOptions,
  type ImageSizePolicy,
} from '@common/domain/comparison-engine.interface';
type Pixelmatch = (
  img1: Buffer,
  img2: Buffer,
  diff: Buffer,
  w: number,
  h: number,
  options: {
    threshold: number;
    diffColor: [number, number, number];
    aaColor: [number, number, number];
  },
) => number;

let pixelmatch: Pixelmatch;

async function ensurePixelmatch(): Promise<Pixelmatch> {
  if (!pixelmatch) {
    pixelmatch = (await import('pixelmatch')).default;
  }
  return pixelmatch;
}

@Injectable()
export class PixelmatchComparisonService implements IComparisonEngine {
  readonly kind = 'image' as const;

  constructor(private readonly logger: AppLoggerService) {}

  async compare(
    expected: Buffer,
    actual: Buffer,
    options: ImageComparisonOptions = {},
  ): Promise<ComparisonResult> {
    const pm = await ensurePixelmatch();

    // Validate the headers before decoding either buffer: a tiny PNG can
    // declare huge dimensions and decode into gigabytes, and legacy oversized
    // baselines must be rejected without ever being decoded.
    this.assertWithinPixelLimit(expected);
    this.assertWithinPixelLimit(actual);

    const imgA = this.decode(expected);
    let candidate = actual;
    const expectedDimensions = readPngDimensions(expected);
    const actualDimensions = readPngDimensions(actual);
    if (
      expectedDimensions &&
      actualDimensions &&
      (expectedDimensions.width !== actualDimensions.width ||
        expectedDimensions.height !== actualDimensions.height)
    ) {
      candidate = await this.applySizePolicy(
        actual,
        options.sizePolicy ?? 'FAIL',
        expectedDimensions.width,
        expectedDimensions.height,
        actualDimensions,
      );
    }
    const imgB = this.decode(candidate);

    if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
      throw new DomainError(
        `Image dimensions do not match: ${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}`,
        'BAD_REQUEST',
      );
    }

    const diff = new PNG({ width: imgA.width, height: imgA.height });
    // The colours are pinned because region extraction reads them back out of
    // the diff buffer: red never means "anti-aliased" and is never reused.
    const mismatchPixelCount = pm(
      imgA.data,
      imgB.data,
      diff.data,
      imgA.width,
      imgA.height,
      {
        threshold: ENGINE_TOLERANCE,
        diffColor: [255, 0, 0],
        aaColor: [255, 255, 0],
      },
    );

    const diffBuffer = PNG.sync.write(diff);
    const changedRegions = extractChangedRegions(
      diff.data,
      imgA.width,
      imgA.height,
    );

    this.logger.debug('Comparison completed', {
      mismatchPixelCount,
      changedRegionCount: changedRegions.length,
    });

    return {
      kind: 'image',
      mismatchPixelCount,
      changedRegions,
      diffOutput: diffBuffer,
    };
  }

  private async applySizePolicy(
    image: Buffer,
    policy: ImageSizePolicy,
    width: number,
    height: number,
    actual: { width: number; height: number },
  ): Promise<Buffer> {
    if (policy === 'FAIL') {
      throw new DomainError(
        `Image dimensions do not match: ${String(width)}x${String(height)} vs ${String(actual.width)}x${String(actual.height)}`,
        'BAD_REQUEST',
      );
    }
    const fit =
      policy === 'PAD' ? 'contain' : policy === 'CROP' ? 'cover' : 'fill';
    try {
      return await sharp(image)
        .resize(width, height, {
          fit,
          position: 'centre',
          background:
            policy === 'PAD' ? { r: 0, g: 0, b: 0, alpha: 1 } : undefined,
        })
        .png()
        .toBuffer();
    } catch {
      throw new DomainError('Invalid image file', 'BAD_REQUEST');
    }
  }

  private assertWithinPixelLimit(image: Buffer): void {
    if (!isPngSignature(image)) {
      throw new DomainError('Invalid PNG image', 'BAD_REQUEST');
    }
    const dimensions = readPngDimensions(image);
    if (dimensions === null) {
      throw new DomainError('Invalid PNG image', 'BAD_REQUEST');
    }
    if (dimensions.width > MAX_IMAGE_PIXELS / dimensions.height) {
      throw new DomainError(
        `Image too large: ${String(dimensions.width)}x${String(dimensions.height)}`,
        'BAD_REQUEST',
      );
    }
  }

  private decode(image: Buffer): PNG {
    try {
      return PNG.sync.read(image);
    } catch {
      throw new DomainError('Invalid PNG image', 'BAD_REQUEST');
    }
  }
}
