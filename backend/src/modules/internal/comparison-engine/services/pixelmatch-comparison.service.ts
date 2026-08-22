import { Injectable } from '@nestjs/common';
import { PNG } from 'pngjs';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { DomainError } from '@common/domain/domain-error';
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
    const imgA = PNG.sync.read(expected);
    const imgB = PNG.sync.read(actual);

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
}
