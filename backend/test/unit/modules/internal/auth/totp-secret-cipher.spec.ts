import { AppConfigService } from '@config/app-config.service';
import { TotpSecretCipher } from '@internal/auth/totp-secret-cipher';

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function cipherWith(key: string): TotpSecretCipher {
  return new TotpSecretCipher({
    auth: { totpEncryptionKey: key },
  } as unknown as AppConfigService);
}

describe('TotpSecretCipher', () => {
  it('round-trips a seed', () => {
    const cipher = cipherWith('key-a');
    const stored = cipher.encrypt(SECRET);

    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(cipher.decrypt(stored)).toBe(SECRET);
  });

  it('produces a different ciphertext on every call', () => {
    const cipher = cipherWith('key-a');

    expect(cipher.encrypt(SECRET)).not.toBe(cipher.encrypt(SECRET));
  });

  it('reads a legacy plaintext seed unchanged', () => {
    const cipher = cipherWith('key-a');

    expect(cipher.isEncrypted(SECRET)).toBe(false);
    expect(cipher.decrypt(SECRET)).toBe(SECRET);
  });

  it('fails closed when the key changed', () => {
    const stored = cipherWith('key-a').encrypt(SECRET);

    expect(() => cipherWith('key-b').decrypt(stored)).toThrow(
      /not decryptable/,
    );
  });

  it('fails closed on a tampered ciphertext', () => {
    const cipher = cipherWith('key-a');
    const [, iv, tag, ciphertext] = cipher.encrypt(SECRET).split(':');
    const tampered = ['v1', iv, tag, `${ciphertext!.slice(0, -2)}AA`].join(':');

    expect(() => cipher.decrypt(tampered)).toThrow(/not decryptable/);
  });

  it('rejects a malformed stored value instead of reading it as plaintext', () => {
    const cipher = cipherWith('key-a');

    expect(() => cipher.decrypt('v1:only-two-parts')).toThrow(/malformed/);
  });
});
