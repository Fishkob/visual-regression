import { plainToInstance } from 'class-transformer';
import { ComparisonDto } from '@public/visualTest/review/presentation/dto/comparison.dto';
import { ScreenshotDto } from '@public/visualTest/review/presentation/dto/screenshot.dto';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import type { UrlSigner } from '@common/domain/url-signer.type';

// A read response carries both forms of every image URL: the canonical stored
// URL (stable identity, used by tests/tools and by the backend itself) and the
// presigned URL the browser renders. The signer is injected so the mapper stays
// a pure function.
export function mapComparisonToDto(
  comparison: ComparisonEntity,
  signUrl: UrlSigner,
): ComparisonDto {
  return plainToInstance(
    ComparisonDto,
    {
      id: comparison.id,
      createdAt: comparison.createdAt,
      status: comparison.status,
      diffImageUrl: comparison.diffImageUrl ?? undefined,
      signedDiffImageUrl: comparison.diffImageUrl
        ? signUrl(comparison.diffImageUrl)
        : undefined,
      mismatchPixelCount: comparison.mismatchPixelCount,
      thresholdExceeded: comparison.thresholdExceeded,
      baseline: comparison.baseline
        ? mapScreenshotToDto(comparison.baseline, signUrl)
        : undefined,
      candidate: comparison.candidate
        ? mapScreenshotToDto(comparison.candidate, signUrl)
        : undefined,
    },
    { excludeExtraneousValues: true },
  );
}

export function mapScreenshotToDto(
  s: ScreenshotEntity,
  signUrl: UrlSigner,
): ScreenshotDto {
  return plainToInstance(
    ScreenshotDto,
    {
      id: s.id,
      visualTestId: s.visualTestId,
      type: s.type,
      imageHash: s.imageHash,
      imageUrl: s.imageUrl,
      signedImageUrl: signUrl(s.imageUrl),
      variant: {
        viewport: s.viewport,
        browser: s.browser,
        environment: s.environment,
      },
      createdAt: s.createdAt,
      pixelDiffThreshold: s.pixelDiffThreshold,
    },
    { excludeExtraneousValues: true },
  );
}
