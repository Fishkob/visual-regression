import {
  REVIEWABLE_PENDING_SQL,
  reviewablePendingWhere,
} from '@public/visualTest/review/infrastructure/repositories/reviewable-pending.sql';

// The review queue is "pending and not muted"; the archived scope stays with
// each reader. Those predicates are shared by the inbox page and every
// reviewer-facing count, so this spec pins both shapes: a change here is a
// change to what every reviewer surface calls reviewable.
describe('reviewable pending predicate', () => {
  const now = new Date('2026-10-26T10:00:00.000Z');
  const muteWindow = {
    OR: [{ mutedUntil: null }, { mutedUntil: { lte: now } }],
  };

  describe('reviewablePendingWhere', () => {
    it('carries the pending status and the mute window together', () => {
      expect(reviewablePendingWhere({ now })).toEqual({
        status: 'PENDING_APPROVAL',
        test: { AND: [muteWindow] },
      });
    });

    it('keeps the caller filters and appends the mute predicate', () => {
      const where = reviewablePendingWhere({
        now,
        test: { kind: 'image', AND: [{ tags: { has: 'flaky' } }] },
      });

      expect(where.test).toEqual({
        kind: 'image',
        AND: [{ tags: { has: 'flaky' } }, muteWindow],
      });
    });

    it('normalizes a single-object AND to a list', () => {
      const where = reviewablePendingWhere({
        now,
        test: { AND: { name: 'checkout' } },
      });

      expect(where.test?.AND).toEqual([{ name: 'checkout' }, muteWindow]);
    });

    it('keeps the other caller filters untouched', () => {
      const where = reviewablePendingWhere({
        now,
        test: { branch: { name: 'main' }, OR: [{ name: 'a' }] },
      });

      expect(where.test).toEqual({
        branch: { name: 'main' },
        OR: [{ name: 'a' }],
        AND: [muteWindow],
      });
    });

    it('uses the current time when no clock is supplied', () => {
      const before = new Date();
      const where = reviewablePendingWhere();
      const after = new Date();

      const and = (where.test?.AND ?? []) as {
        OR: [{ mutedUntil: null }, { mutedUntil: { lte: Date } }];
      }[];
      const cutoff = and[0].OR[1].mutedUntil.lte;
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
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
