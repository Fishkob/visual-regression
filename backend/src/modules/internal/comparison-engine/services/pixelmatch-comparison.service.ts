import { Injectable } from '@nestjs/common';
import { PNG } from 'pngjs';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { DomainError } from '@common/domain/domain-error';
import { MAX_IMAGE_PIXELS } from '@config/upload-limits';
import { isPngSignature, readPngDimensions } from '@common/utils/png-header';
import {
  ComparisonResult,
  IComparisonEngine,
  ENGINE_TOLERANCE,
} from '@common/domain/comparison-engine.interface';
type Pixelmatch = (
  img1: Buffer,
  img2: Buffer,
  diff: Buffer,
  w: number,
  h: number,
  options: { threshold: number },
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

  async compare(expected: Buffer, actual: Buffer): Promise<ComparisonResult> {
    const pm = await ensurePixelmatch();

    // Validate the headers before decoding either buffer: a tiny PNG can
    // declare huge dimensions and decode into gigabytes, and legacy oversized
    // baselines must be rejected without ever being decoded.
    this.assertWithinPixelLimit(expected);
    this.assertWithinPixelLimit(actual);

    const imgA = this.decode(expected);
    const imgB = this.decode(actual);

    if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
      throw new DomainError(
        `Image dimensions do not match: ${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}`,
        'BAD_REQUEST',
      );
    }

    const diff = new PNG({ width: imgA.width, height: imgA.height });
    const mismatchPixelCount = pm(
      imgA.data,
      imgB.data,
      diff.data,
      imgA.width,
      imgA.height,
      { threshold: ENGINE_TOLERANCE },
    );

    const diffBuffer = PNG.sync.write(diff);

    this.logger.debug('Comparison completed', { mismatchPixelCount });

    return {
      kind: 'image',
      mismatchPixelCount,
      diffOutput: diffBuffer,
    };
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
