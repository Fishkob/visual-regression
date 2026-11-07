import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  legacyHashRecoveryCode,
  normalizeRecoveryCode,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from '@internal/auth/totp';

const RECOVERY_PEPPER = 'a'.repeat(64);

describe('TOTP', () => {
  // RFC 6238 SHA-1 vectors for the 20-byte seed "12345678901234567890".
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('matches the RFC 6238 SHA-1 test vectors', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082');
    expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(RFC_SECRET, 1_234_567_890_000)).toBe('005924');
    expect(totpCode(RFC_SECRET, 2_000_000_000_000)).toBe('279037');
  });

  it('verifies the current code and one step of skew only', () => {
    const at = 1_234_567_890_000;
    const code = totpCode(RFC_SECRET, at);

    expect(verifyTotp(RFC_SECRET, code, { timestampMs: at })).toBe(true);
    expect(
      verifyTotp(RFC_SECRET, code, {
        timestampMs: at + 30_000,
        window: 1,
      }),
    ).toBe(true);
    expect(
      verifyTotp(RFC_SECRET, code, {
        timestampMs: at + 90_000,
        window: 1,
      }),
    ).toBe(false);
    expect(verifyTotp(RFC_SECRET, '000000', { timestampMs: at })).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345', { timestampMs: at })).toBe(false);
  });

  it('generates decodable secrets and a valid otpauth URI', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpCode(secret)).toMatch(/^\d{6}$/);

    const url = otpauthUrl('VRT', 'alice@example.com', secret);
    expect(url).toContain('otpauth://totp/VRT:alice%40example.com');
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain('period=30');
  });

  it('generates 10 normalized, hashable recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
    expect(normalizeRecoveryCode(codes[0]!)).toHaveLength(16);
    expect(hashRecoveryCode(codes[0]!, RECOVERY_PEPPER)).toBe(
      hashRecoveryCode(codes[0]!.toLowerCase(), RECOVERY_PEPPER),
    );
  });

  it('keys the recovery-code hash with the pepper', () => {
    const code = 'ABCD-EFGH-JKLM-NPQR';
    const hashed = hashRecoveryCode(code, RECOVERY_PEPPER);

    expect(hashed).toMatch(/^hmac-sha256\$[0-9a-f]{64}$/);
    expect(hashRecoveryCode(code, 'another-pepper')).not.toBe(hashed);
    // A bare digest of the code is not what the peppered hash produces, so a
    // leaked table without the environment secret does not verify.
    expect(hashed).not.toContain(legacyHashRecoveryCode(code));
  });

  it('still recognises a hash written before the pepper existed', () => {
    const code = 'ABCD-EFGH-JKLM-NPQR';
    expect(legacyHashRecoveryCode(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(legacyHashRecoveryCode(code)).toBe(
      legacyHashRecoveryCode(code.toLowerCase().replace(/-/g, '')),
    );
  });
});
