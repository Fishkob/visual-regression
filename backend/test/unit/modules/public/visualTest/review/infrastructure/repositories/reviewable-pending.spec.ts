import {
  REVIEWABLE_PENDING_SQL,
  reviewablePendingWhere,
} from '@public/visualTest/review/infrastructure/repositories/reviewable-pending.sql';

// The review queue is "pending and not muted"; the archived scope stays with
// each reader. Those predicates are shared by the inbox page and every
// reviewer-facing count, so this spec pins both shapes: a change here is a
// change to what every reviewer surface calls reviewable.
describe('reviewable pending predicate', () => {
  describe('reviewablePendingWhere', () => {
    it('accepts an unmuted test and a mute that has expired', () => {
      const now = new Date('2026-10-26T10:00:00.000Z');

      expect(reviewablePendingWhere(now)).toEqual({
        OR: [{ mutedUntil: null }, { mutedUntil: { lte: now } }],
      });
    });

    it('uses the current time when no clock is supplied', () => {
      const before = new Date();
      const where = reviewablePendingWhere();
      const after = new Date();

      const cutoff = where.OR?.[1] as { mutedUntil: { lte: Date } };
      expect(cutoff.mutedUntil.lte.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(cutoff.mutedUntil.lte.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
    });
  });

  describe('REVIEWABLE_PENDING_SQL', () => {
    it('filters the status and the mute window on the c/t aliases', () => {
      expect(REVIEWABLE_PENDING_SQL.sql).toContain('c.status = ?');
      expect(REVIEWABLE_PENDING_SQL.sql).toContain('t."mutedUntil" IS NULL');
      expect(REVIEWABLE_PENDING_SQL.sql).toContain('t."mutedUntil" <= now()');
    });

    it('binds the pending status from its single owner', () => {
      expect(REVIEWABLE_PENDING_SQL.values).toEqual(['PENDING_APPROVAL']);
    });

    it('leaves the archived scope to the reader', () => {
      expect(REVIEWABLE_PENDING_SQL.sql).not.toContain('isArchived');
    });
  });
});
