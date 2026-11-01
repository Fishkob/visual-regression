import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const KEY_LEN = 64;
const SALT_LEN = 16;

// scrypt is deliberately memory-hard, so a burst of concurrent logins is a
// memory spike, not just CPU: each N=2^16 hash holds ~64 MiB. Two slots bound
// the API at ~128 MiB of hashing memory (the container limit is 512 MiB) while
// still sustaining far more logins/second than the per-IP login limiter allows.
const MAX_CONCURRENT_SCRYPT = 2;

let activeScrypt = 0;
const scryptWaiters: (() => void)[] = [];

async function withScryptSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeScrypt < MAX_CONCURRENT_SCRYPT) {
    activeScrypt += 1;
  } else {
    await new Promise<void>((resolve) => {
      scryptWaiters.push(resolve);
    });
  }
  try {
    return await work();
  } finally {
    const next = scryptWaiters.shift();
    if (next) {
      next();
    } else {
      activeScrypt -= 1;
    }
  }
}

// Work factor for new hashes. Node's default (N=2^14) is below current OWASP
// scrypt guidance, so the cost is explicit and encoded into the stored string:
// `scrypt$N$r$p$salt$hash`. N=2^16 keeps a login around 100-200 ms and one hash
// around 64 MiB; N=2^17 was rejected as needlessly heavy for a 512 MiB API
// container, and the two-slot gate below bounds the concurrent footprint.
const SCRYPT_N = 1 << 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

// Hashes written before the parameters were encoded use Node's defaults and the
// legacy `salt:hash` shape. They keep verifying and are upgraded on the next
// password change.
const LEGACY = {
  N: 1 << 14,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};
const LEGACY_PARTS = 2;
const PARAM_PARTS = 6;
const PARAM_PREFIX = 'scrypt';
const MIN_N = 1 << 10;
const MAX_N = 1 << 20;
const MAX_R = 32;
const MAX_P = 16;

interface StoredHash {
  params: { N: number; r: number; p: number; maxmem: number };
  salt: string;
  expected: Buffer;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString('hex');
  const derived = await withScryptSlot(() =>
    scryptAsync(password, salt, KEY_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    }),
  );
  return `${PARAM_PREFIX}$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

// True for a hash written before the cost parameters were encoded (the legacy
// `salt:hash` shape). Callers that hold the plaintext (login) rehash on success
// so an old hash is upgraded without waiting for the next password change.
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`${PARAM_PREFIX}$`);
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  const derived = await withScryptSlot(() =>
    scryptAsync(password, parsed.salt, KEY_LEN, parsed.params),
  );
  return timingSafeEqual(derived, parsed.expected);
}

function parseStoredHash(stored: string): StoredHash | null {
  if (stored.startsWith(`${PARAM_PREFIX}$`)) {
    const parts = stored.split('$');
    if (parts.length !== PARAM_PARTS) return null;
    const [, rawN, rawR, rawP, salt, hashHex] = parts;
    const n = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);
    if (!isValidParams(n, r, p) || !salt) return null;
    const expected = decodeHash(hashHex);
    if (!expected) return null;
    return {
      params: {
        N: n,
        r,
        p,
        // 128*N*r is the scrypt working set; double it so maxmem never becomes
        // the failure mode for a parameter set the row itself declares valid.
        maxmem: Math.max(SCRYPT_MAXMEM, 256 * n * r),
      },
      salt,
      expected,
    };
  }

  const parts = stored.split(':');
  if (parts.length !== LEGACY_PARTS) return null;
  const [salt, hashHex] = parts;
  if (!salt) return null;
  const expected = decodeHash(hashHex);
  if (!expected) return null;
  return { params: LEGACY, salt, expected };
}

// The parameters come from the database, not from a request, but a corrupted or
// hand-edited row must not become an allocation bomb on the login path.
function isValidParams(n: number, r: number, p: number): boolean {
  return (
    Number.isInteger(n) &&
    n >= MIN_N &&
    n <= MAX_N &&
    (n & (n - 1)) === 0 &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= MAX_R &&
    Number.isInteger(p) &&
    p >= 1 &&
    p <= MAX_P
  );
}

function decodeHash(hashHex: string | undefined): Buffer | null {
  if (!hashHex) return null;
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === KEY_LEN ? expected : null;
}
