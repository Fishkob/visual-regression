import { Prisma } from '@/prisma/client';
import { PENDING_APPROVAL_STATUS_FILTER } from '@public/visualTest/core/domain/types/visual-test.types';

// The review queue is: PENDING_APPROVAL ∧ not muted ∧ the reader's archived
// scope. The status has its own owner (PENDING_APPROVAL_STATUS_FILTER); this
// module owns the half every reviewer-facing read must agree on — "a pending
// comparison the queue currently offers".
//
// It exists in two shapes because the reads do: the inbox page filters with a
// Prisma where-tree, the counts (inbox badge, project list, branch switcher) are
// grouped SQL. Both shapes live here so a change to one is a change in this
// file, not a hunt through four repositories. The archived scope deliberately
// stays with each reader: the queue and the project list exclude archived
// branches, while the branch switcher's count must still be right when the
// caller explicitly asks for archived branches.
//
// Verified against fixtures in an isolated database (muted test on a live
// branch, pending comparison on an archived branch): before this module the
// inbox badge counted the muted test and said 2 where the queue showed 1.

const PENDING_STATUS = PENDING_APPROVAL_STATUS_FILTER.status;

// SQL shape for `UnifiedComparison c JOIN UnifiedTest t` — the aliases are part
// of the contract, so every caller names the comparison `c` and the test `t`.
export const REVIEWABLE_PENDING_SQL = Prisma.sql`c.status = ${PENDING_STATUS} AND (t."mutedUntil" IS NULL OR t."mutedUntil" <= now())`;

// Prisma shape, composed into `UnifiedTestWhereInput.AND`.
export function reviewablePendingWhere(
  now: Date = new Date(),
): Prisma.UnifiedTestWhereInput {
  return { OR: [{ mutedUntil: null }, { mutedUntil: { lte: now } }] };
}
