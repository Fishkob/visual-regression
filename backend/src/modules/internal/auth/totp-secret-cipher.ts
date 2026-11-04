import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { AppConfigService } from '@config/app-config.service';

// The TOTP seed is the one credential that has to be reversible: every code is
// derived from it, so it cannot be hashed like a session token. Stored bare, a
// database dump (or a stolen backup) hands out every user's second factor for
// as long as the account lives.
//
// AES-256-GCM with a key derived from TOTP_ENCRYPTION_KEY. The stored form is
// `v1:<iv>:<tag>:<ciphertext>` (base64url). A value without the prefix is a
// legacy plaintext seed: it is returned as-is so an upgrade does not lock
// anyone out, and the caller re-encrypts it after a successful verification.
// A tampered value throws instead of falling back to plaintext — a failure to
// decrypt must never read as "this account has no second factor".
@Injectable()
export class TotpSecretCipher {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly version = 'v1';
  private static readonly ivBytes = 12;
  private static readonly tagBytes = 16;

  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    this.key = createHash('sha256')
      .update(config.auth.totpEncryptionKey, 'utf8')
      .digest();
  }

  isEncrypted(stored: string): boolean {
    return stored.startsWith(`${TotpSecretCipher.version}:`);
  }

  encrypt(secret: string): string {
    const iv = randomBytes(TotpSecretCipher.ivBytes);
    const cipher = createCipheriv(TotpSecretCipher.algorithm, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return [
      TotpSecretCipher.version,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(stored: string): string {
    if (!this.isEncrypted(stored)) return stored;

    const [version, iv, tag, ciphertext] = stored.split(':');
    if (version !== TotpSecretCipher.version || !iv || !tag || !ciphertext) {
      throw new Error('Stored TOTP secret is malformed');
    }
    const tagBytes = Buffer.from(tag, 'base64url');
    if (tagBytes.length !== TotpSecretCipher.tagBytes) {
      throw new Error('Stored TOTP secret is malformed');
    }
    try {
      const decipher = createDecipheriv(
        TotpSecretCipher.algorithm,
        this.key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(tagBytes);
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Wrong key (rotated without re-encrypting) or tampered ciphertext.
      throw new Error('Stored TOTP secret is not decryptable');
    }
  }
}
