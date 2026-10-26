import { isCredentialLive } from '@internal/auth/credential-liveness.policy';

describe('CredentialLivenessPolicy', () => {
  const now = new Date('2026-10-26T10:00:00.000Z');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is live while unrevoked and unexpired', () => {
    expect(
      isCredentialLive(
        { revokedAt: null, expiresAt: new Date('2026-10-26T11:00:00.000Z') },
        now,
      ),
    ).toBe(true);
  });

  it('is dead once revoked, whatever the expiry says', () => {
    expect(
      isCredentialLive(
        {
          revokedAt: new Date('2026-10-26T09:00:00.000Z'),
          expiresAt: new Date('2026-10-26T11:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('is dead at the expiry instant', () => {
    expect(isCredentialLive({ revokedAt: null, expiresAt: now }, now)).toBe(
      false,
    );
  });

  it('treats a credential without an expiry as never expiring', () => {
    expect(isCredentialLive({ revokedAt: null, expiresAt: null }, now)).toBe(
      true,
    );
  });
});
