import { plainToInstance } from 'class-transformer';
import { resolveVariantStatusFromComparison } from '@public/visualTest/core/domain/policies/test-status.policy';
import type { TestVariantSummaryResult } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { TestVariantsDto } from '@public/visualTest/review/presentation/dto/visual-test.dto';
import type { UrlSigner } from '@common/domain/url-signer.type';

// The gallery's projection from the read model to the API shape. The per-variant
// status comes from the same policy the project overview uses, so a gallery tile
// never labels a variant differently than the test list does. Every image URL is
// returned twice: canonical (identity) and presigned (what the browser renders).
export function mapTestVariantsToDto(
  result: TestVariantSummaryResult,
  signUrl: UrlSigner,
): TestVariantsDto {
  const candidateOf = (variant: TestVariantSummaryResult['variants'][number]) =>
    variant.latestComparison?.candidate?.imageUrl ?? null;
  return plainToInstance(
    TestVariantsDto,
    {
      name: result.name,
      kind: result.kind,
      variants: result.variants.map((variant) => {
        const candidateUrl = candidateOf(variant);
        return {
          viewport: variant.viewport,
          browser: variant.browser,
          environment: variant.environment,
          status: resolveVariantStatusFromComparison(
            variant.latestComparison?.status,
            variant.baselineUrl != null,
          ),
          baselineUrl: variant.baselineUrl,
          signedBaselineUrl: variant.baselineUrl
            ? signUrl(variant.baselineUrl)
            : null,
          candidateUrl,
          signedCandidateUrl: candidateUrl ? signUrl(candidateUrl) : null,
          mismatchPixelCount:
            variant.latestComparison?.mismatchPixelCount ?? null,
          baselineInherited: variant.isInherited,
        };
      }),
    },
    { excludeExtraneousValues: true },
  );
}
