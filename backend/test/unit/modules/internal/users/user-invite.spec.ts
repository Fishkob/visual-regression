import {
  inviteExpiry,
  invitePassword,
  inviteStatus,
  mintInviteToken,
} from '@internal/users/user-invite';
import { hashToken } from '@internal/auth/token-hash';

describe('user-invite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('mintInviteToken', () => {
    it('returns a fresh 32-byte token on every call', () => {
      const first = mintInviteToken();
      const second = mintInviteToken();

      expect(first).not.toBe(second);
      // base64url of 32 bytes, so the URL carries 256 bits of entropy.
      expect(first).toHaveLength(43);
      expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('invitePassword', () => {
    it('derives the same password from the same token', () => {
      const token = mintInviteToken();

      expect(invitePassword(token)).toBe(invitePassword(token));
    });

    it('derives a different password for every token', () => {
      expect(invitePassword(mintInviteToken())).not.toBe(
        invitePassword(mintInviteToken()),
      );
    });

    it('is not the stored token hash, so the row alone cannot reveal it', () => {
      const token = mintInviteToken();

      expect(invitePassword(token)).not.toBe(hashToken(token));
      expect(invitePassword(token)).not.toContain(hashToken(token));
    });

    it('keeps a 20-character password', () => {
      expect(invitePassword(mintInviteToken())).toHaveLength(20);
    });
  });

  describe('inviteExpiry', () => {
    it('expires seven days later', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');

      expect(inviteExpiry(now).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    });
  });

  describe('inviteStatus', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const base = {
      expiresAt: new Date('2026-01-08T00:00:00.000Z'),
      consumedAt: null,
      user: { isActive: true, mustChangePassword: true },
    };

    it('reports a pending link while it is unused and unexpired', () => {
      expect(inviteStatus(base, now)).toBe('pending');
    });

    it('reports a revealed link as used', () => {
      expect(inviteStatus({ ...base, consumedAt: now }, now)).toBe('used');
    });

    it('reports an expired link', () => {
      expect(
        inviteStatus(
          { ...base, expiresAt: new Date('2025-12-31T00:00:00.000Z') },
          now,
        ),
      ).toBe('expired');
    });

    // The credential the link carries is only outstanding until the account
    // stops being one that must change its password — that is the whole point of
    // the flow, so a link left over after it is not "pending".
    it('reports a link whose password was already replaced as used', () => {
      expect(
        inviteStatus(
          { ...base, user: { isActive: true, mustChangePassword: false } },
          now,
        ),
      ).toBe('used');
    });

    it('reports a deactivated account as used', () => {
      expect(
        inviteStatus(
          { ...base, user: { isActive: false, mustChangePassword: true } },
          now,
        ),
      ).toBe('used');
    });
  });
});
