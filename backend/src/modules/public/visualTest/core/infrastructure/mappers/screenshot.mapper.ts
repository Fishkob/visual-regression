import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';

export function toScreenshotEntity(
  prisma: {
    id: string;
    testId: string;
    type: string;
    imageHash: string;
    imageUrl: string;
    pageCount: number | null;
    pixelDiffThreshold: number;
    createdAt: Date;
  },
  variant: Variant,
): ScreenshotEntity {
  return new ScreenshotEntity({
    id: prisma.id,
    visualTestId: prisma.testId,
    type: prisma.type as 'BASELINE' | 'CURRENT',
    imageHash: prisma.imageHash,
    imageUrl: prisma.imageUrl,
    variant,
    createdAt: prisma.createdAt,
    pixelDiffThreshold: prisma.pixelDiffThreshold,
    pageCount: prisma.pageCount,
  });
}
