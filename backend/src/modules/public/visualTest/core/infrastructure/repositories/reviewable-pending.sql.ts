import { Prisma } from '@/prisma/client';
import { PENDING_APPROVAL_STATUS_FILTER } from '@public/visualTest/core/domain/types/visual-test.types';

// The review queue is: PENDING_APPROVAL ∧ not muted ∧ the reader's archived
// scope. This module owns the first two — the half every reviewer-facing read
// must agree on — in the two shapes the reads need: a Prisma where-tree for the
// inbox page (and its count, in the same query) and a SQL fragment for the
// grouped counts behind the inbox badge, the project list and the branch
// switcher. Both shapes carry the status *and* the mute window, so a caller
// cannot receive half a predicate and quietly under-filter.
//
// The archived scope deliberately stays with each reader: the queue and the
// project list exclude archived branches, while the branch switcher's count must
// still be right when the caller explicitly asks for archived branches.
//
// The mute comparison is spelled once per language (Prisma tree vs SQL text)
// because the readers run in different places; the SQL shape keeps `now()` so
// the database clock decides there instead of the API process's clock. In
// Prisma the clock is a parameter: a caller that reports the muted subset next
// to the reviewable set passes one `now` to both, so the two cannot straddle
// the boundary. The muted polarity is derived here too — it is the exact
// complement (a NULL `mutedUntil` is never muted), not a second rule.
//
// Verified against fixtures in an isolated database (muted test on a live
// branch, pending comparison on an archived branch): before this module the
// inbox badge counted the muted test and said 2 where the queue showed 1.

const PENDING_STATUS = PENDING_APPROVAL_STATUS_FILTER.status;

// "This test is not muted right now." Null means never muted, which is why the
// complement below is `gt` and not `not(...)`: under SQL's three-valued logic a
// NULL row must land on this side.
export function notMutedNow(
  now: Date = new Date(),
): Prisma.UnifiedTestWhereInput {
  return { OR: [{ mutedUntil: null }, { mutedUntil: { lte: now } }] };
}

// The complement: a test muted strictly after `now`. Callers that count the
// muted subset (the run gate's `mutedPending`) take this instead of re-typing
// the window, so "pending" and "muted pending" cannot disagree.
export function mutedNow(now: Date = new Date()): Prisma.UnifiedTestWhereInput {
  return { mutedUntil: { gt: now } };
}

// SQL shape for `UnifiedComparison c JOIN UnifiedTest t` — the aliases are part
// of the contract, so every caller names the comparison `c` and the test `t`.
export const REVIEWABLE_PENDING_SQL = Prisma.sql`c.status = ${PENDING_STATUS} AND (t."mutedUntil" IS NULL OR t."mutedUntil" <= now())`;

// Prisma shape for a `UnifiedComparison` query. The caller's own test filters go
// in `test`; the mute predicate is *appended* to their AND list instead of
// replacing it, so a reader that already narrows by name, kind, tag or assignee
// keeps its own conditions.
export function reviewablePendingWhere(
  input: {
    test?: Prisma.UnifiedTestWhereInput;
    now?: Date;
  } = {},
): Prisma.UnifiedComparisonWhereInput {
  const now = input.now ?? new Date();
  const callerAnd = input.test?.AND;
  return {
    status: PENDING_STATUS,
    test: {
      ...input.test,
      AND: [
        ...(Array.isArray(callerAnd)
          ? callerAnd
          : callerAnd
            ? [callerAnd]
            : []),
        notMutedNow(now),
      ],
    },
  };
}
