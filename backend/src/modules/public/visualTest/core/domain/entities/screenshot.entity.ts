import { ScreenshotType } from '@public/visualTest/core/domain/types/visual-test.types';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { DomainError } from '@common/domain/domain-error';

export class ScreenshotEntity {
  readonly id: string;
  readonly visualTestId: string;
  readonly type: ScreenshotType;
  readonly imageHash: string;
  readonly imageUrl: string;
  readonly variant: Variant;
  readonly createdAt: Date;
  readonly pixelDiffThreshold: number;
  readonly pageCount?: number | null;

  get viewport(): string {
    return this.variant.viewport;
  }

  get browser(): string {
    return this.variant.browser;
  }

  get environment(): string {
    return this.variant.environment;
  }

  constructor(params: {
    id: string;
    visualTestId: string;
    type: ScreenshotType;
    imageHash: string;
    imageUrl: string;
    variant: Variant;
    createdAt: Date;
    pixelDiffThreshold: number;
    pageCount?: number | null;
  }) {
    if (!params.id || params.id.trim() === '') {
      throw new DomainError('Screenshot id is required', 'INVALID_STATE');
    }
    if (!params.visualTestId || params.visualTestId.trim() === '') {
      throw new DomainError('VisualTestId is required', 'INVALID_STATE');
    }
    if (!params.imageHash || params.imageHash.trim() === '') {
      throw new DomainError('ImageHash is required', 'INVALID_STATE');
    }
    if (params.pixelDiffThreshold < 0) {
      throw new DomainError(
        'PixelDiffThreshold cannot be negative',
        'INVALID_STATE',
      );
    }
    if (
      params.pageCount !== undefined &&
      params.pageCount !== null &&
      params.pageCount < 0
    ) {
      throw new DomainError('Page count cannot be negative', 'INVALID_STATE');
    }
    if (!Object.values(ScreenshotType).includes(params.type)) {
      throw new DomainError(
        `Invalid screenshot type: ${params.type}`,
        'INVALID_STATE',
      );
    }

    this.id = params.id;
    this.visualTestId = params.visualTestId;
    this.type = params.type;
    this.imageHash = params.imageHash;
    this.imageUrl = params.imageUrl;
    this.variant = params.variant;
    this.createdAt = params.createdAt;
    this.pixelDiffThreshold = params.pixelDiffThreshold;
    this.pageCount = params.pageCount;
  }
}
