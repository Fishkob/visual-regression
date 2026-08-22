import { plainToInstance } from 'class-transformer';
import { ComparisonDto } from '@public/visualTest/review/presentation/dto/comparison.dto';
import { ScreenshotDto } from '@public/visualTest/review/presentation/dto/screenshot.dto';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';

export function mapComparisonToDto(
  comparison: ComparisonEntity,
): ComparisonDto {
  return plainToInstance(
    ComparisonDto,
    {
      id: comparison.id,
      createdAt: comparison.createdAt,
      status: comparison.status,
      diffImageUrl: comparison.diffImageUrl ?? undefined,
      mismatchPixelCount: comparison.mismatchPixelCount,
      thresholdExceeded: comparison.thresholdExceeded,
      baseline: comparison.baseline
        ? mapScreenshotToDto(comparison.baseline)
        : undefined,
      candidate: comparison.candidate
        ? mapScreenshotToDto(comparison.candidate)
        : undefined,
    },
    { excludeExtraneousValues: true },
  );
}

export function mapScreenshotToDto(s: ScreenshotEntity): ScreenshotDto {
  return plainToInstance(
    ScreenshotDto,
    {
      id: s.id,
      visualTestId: s.visualTestId,
      type: s.type,
      imageHash: s.imageHash,
      imageUrl: s.imageUrl,
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
