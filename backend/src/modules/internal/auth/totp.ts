import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const RECOVERY_CODE_BYTES = 10;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(encoded: string): Buffer {
  const normalized = encoded.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function totpCode(
  secret: string,
  timestampMs: number = Date.now(),
  periodSeconds = TOTP_PERIOD_SECONDS,
): string {
  return hotp(secret, Math.floor(timestampMs / 1000 / periodSeconds));
}

// Window ±1 step tolerates clock skew without accepting a code for long.
export function verifyTotp(
  secret: string,
  code: string,
  options: { timestampMs?: number; window?: number } = {},
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const timestampMs = options.timestampMs ?? Date.now();
  const window = options.window ?? 1;
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  const expected = Buffer.from(code);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = Buffer.from(hotp(secret, counter + offset));
    if (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    ) {
      return true;
    }
  }
  return false;
}

export function otpauthUrl(
  issuer: string,
  account: string,
  secret: string,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

// A recovery code is a second factor, so its stored form may not be crackable by
// whoever reads the database — which is the threat the TOTP seed encryption
// exists for. Keyed with a subkey of TOTP_ENCRYPTION_KEY: unlike a hash, the
// stored value is useless without the environment secret.
export function hashRecoveryCode(code: string, pepper: string): string {
  return `hmac-sha256$${createHmac('sha256', pepper)
    .update(normalizeRecoveryCode(code))
    .digest('hex')}`;
}

// Hashes written before the pepper existed: unsalted SHA-256 over a 40-bit code
// space. Still accepted so an upgrade does not lock anyone out; the code is
// consumed on use, so each row is replaced by never being reachable again.
export function legacyHashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    // 10 bytes is 80 bits: with the pepper gone the stored hashes are not a
    // brute-force target either.
    const raw = base32Encode(randomBytes(RECOVERY_CODE_BYTES));
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  });
}
