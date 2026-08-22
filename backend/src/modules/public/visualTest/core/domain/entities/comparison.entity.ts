import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { DomainError } from '@common/domain/domain-error';
import { isThresholdExceeded } from '@public/visualTest/core/domain/policies/threshold-policy';

export class ApprovalDecision {
  constructor(
    readonly visualTestId: string,
    readonly baselineId: string,
    readonly comparisonId: string,
    readonly newBaseline: {
      imageHash: string;
      imageUrl: string;
      variant: Variant;
      pageCount?: number | null;
    },
    readonly previousBaselineUrl: string,
    readonly diffImageUrl: string | null,
    readonly candidateId: string,
    readonly diffPdfUrl?: string,
  ) {}

  get newBaselineUrl(): string {
    return this.newBaseline.imageUrl;
  }
}

export class ComparisonEntity {
  readonly id: string;
  readonly visualTestId: string;
  readonly mismatchPixelCount: number;
  readonly diffImageUrl: string | null;
  status: ComparisonStatus;
  readonly baselineId: string;
  readonly candidateId?: string;
  readonly createdAt: Date;
  readonly baseline?: ScreenshotEntity | null;
  readonly candidate?: ScreenshotEntity | null;
  readonly pageCount?: number;
  readonly mismatchPageCount?: number;
  readonly diffPdfUrl?: string;

  constructor(params: {
    id: string;
    visualTestId: string;
    mismatchPixelCount: number;
    diffImageUrl: string | null;
    readonly status: ComparisonStatus;
    baselineId: string;
    candidateId?: string;
    createdAt: Date;
    baseline?: ScreenshotEntity | null;
    candidate?: ScreenshotEntity | null;
    pageCount?: number;
    mismatchPageCount?: number;
    diffPdfUrl?: string;
  }) {
    if (!params.id || params.id.trim() === '') {
      throw new DomainError('Comparison id is required', 'INVALID_STATE');
    }
    if (!params.visualTestId || params.visualTestId.trim() === '') {
      throw new DomainError('VisualTestId is required', 'INVALID_STATE');
    }
    if (params.mismatchPixelCount < 0) {
      throw new DomainError(
        'Mismatch pixel count cannot be negative',
        'INVALID_STATE',
      );
    }
    if (
      params.mismatchPageCount !== undefined &&
      params.mismatchPageCount < 0
    ) {
      throw new DomainError(
        'Mismatch page count cannot be negative',
        'INVALID_STATE',
      );
    }
    if (params.pageCount !== undefined && params.pageCount < 0) {
      throw new DomainError('Page count cannot be negative', 'INVALID_STATE');
    }
    if (!params.baselineId || params.baselineId.trim() === '') {
      throw new DomainError('BaselineId is required', 'INVALID_STATE');
    }

    this.id = params.id;
    this.visualTestId = params.visualTestId;
    this.mismatchPixelCount = params.mismatchPixelCount;
    this.diffImageUrl = params.diffImageUrl;
    this.status = params.status;
    this.baselineId = params.baselineId;
    this.candidateId = params.candidateId;
    this.createdAt = params.createdAt;
    this.baseline = params.baseline;
    this.candidate = params.candidate;
    this.pageCount = params.pageCount;
    this.mismatchPageCount = params.mismatchPageCount;
    this.diffPdfUrl = params.diffPdfUrl;
  }

  // Threshold is an image-only concept (PDF threshold updates are rejected), so
  // the read flag is computed from the baseline's pixel threshold alone.
  get thresholdExceeded(): boolean {
    return this.baseline
      ? isThresholdExceeded(
          this.mismatchPixelCount,
          this.baseline.pixelDiffThreshold,
        )
      : false;
  }

  // Builds the approval decision from exactly the comparison the reviewer saw.
  // The "only while PENDING_APPROVAL" invariant is part of this interface: a
  // non-pending comparison refuses to approve. The service-level resolve() adds
  // a friendlier CONFLICT for a stale review target, and the repository write
  // guard stays as the atomic backstop — but the entity is the owner a caller
  // can learn the rule from.
  approve(
    baseline: ScreenshotEntity,
    candidate: ScreenshotEntity,
  ): ApprovalDecision {
    if (this.status !== ComparisonStatus.PENDING_APPROVAL) {
      throw new DomainError(
        'Cannot approve a comparison that is not pending approval',
        'INVALID_STATE',
      );
    }
    return new ApprovalDecision(
      this.visualTestId,
      baseline.id,
      this.id,
      {
        imageHash: candidate.imageHash,
        imageUrl: candidate.imageUrl,
        variant: candidate.variant,
        pageCount: candidate.pageCount,
      },
      baseline.imageUrl,
      this.diffImageUrl,
      candidate.id,
      this.diffPdfUrl,
    );
  }
}
