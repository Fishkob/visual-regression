import { ComparisonStatus, ScreenshotType, TestStatus } from '@/prisma/client';
import type { Prisma } from '@/prisma/client';

export { ComparisonStatus, ScreenshotType, TestStatus };

export {
  ComparisonOutcome,
  ComparisonErrorCode,
} from '@common/domain/upload-outcome';

export const REVIEWABLE_COMPARISON_STATUSES = [
  ComparisonStatus.PENDING_APPROVAL,
  ComparisonStatus.APPROVED,
] as const;

// The shared "is a comparison reviewable" status predicate. Every consumer of
// the "latest reviewable comparison" rule (the persisted-status derivation via
// LATEST_REVIEWABLE_COMPARISON_QUERY and the read model) spreads this into its
// where clause, so the status set is one edit, not three.
export const REVIEWABLE_COMPARISON_STATUS_FILTER = {
  status: { in: [...REVIEWABLE_COMPARISON_STATUSES] },
} as const satisfies Pick<Prisma.UnifiedComparisonWhereInput, 'status'>;

// The write-side twin of the reviewable set: "only a PENDING_APPROVAL
// comparison can be approved or retired". Every guarded write (completeImage/
// completePdfApproval, retirePendingForVariant, deletePendingByIds, the
// threshold read) spells this predicate through the constant, so the approval
// eligibility rule is one edit instead of five literal spellings.
export const PENDING_APPROVAL_STATUS_FILTER = {
  status: ComparisonStatus.PENDING_APPROVAL,
} as const satisfies Pick<Prisma.UnifiedComparisonWhereInput, 'status'>;

// The deterministic tie-break for "which reviewable comparison counts as
// latest": newest createdAt, then newest id. Shared between the persisted-status
// derivation, the read model, and the per-baseline read so the ordering rule
// cannot drift between them. A change to the tie-break is one edit here.
export const REVIEWABLE_COMPARISON_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] as const satisfies Prisma.UnifiedComparisonOrderByWithRelationInput[];

// The shared shape of the "latest reviewable comparison per baseline" query,
// used by the persisted-status derivation (VariantStore.findVariantStatusSignals)
// and the project read model (ProjectReadRepository.getWithLatestVariantStatuses)
// so the two cannot drift on the ordering tie-break or the status set. A change
// to which comparison "counts" is one edit here, not three.
export const LATEST_REVIEWABLE_COMPARISON_QUERY = {
  where: REVIEWABLE_COMPARISON_STATUS_FILTER,
  orderBy: REVIEWABLE_COMPARISON_ORDER,
  take: 1,
  select: { status: true },
} as const satisfies Prisma.UnifiedComparisonFindManyArgs;
