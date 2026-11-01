import { scryptSync } from 'node:crypto';
import { hashPassword, verifyPassword } from '@internal/auth/password-hasher';

function legacyHash(
  password: string,
  salt: string,
  params: { N: number; r: number; p: number },
): string {
  const derived = scryptSync(password, salt, 64, {
    ...params,
    maxmem: 512 * 1024 * 1024,
  });
  return `${salt}:${derived.toString('hex')}`;
}

describe('password-hasher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes the cost parameters in the stored hash', async () => {
    const out = await hashPassword('correct horse');

    expect(out).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    const [, N, r, p] = out.split('$');
    expect(Number(N)).toBeGreaterThanOrEqual(1 << 16);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it('produces a unique salt per hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same'),
      hashPassword('same'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('secret');
    await expect(verifyPassword('secret', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('secret');
    await expect(verifyPassword('nope', hash)).resolves.toBe(false);
  });

  it('verifies a legacy salt:hash row against the old cost factor', async () => {
    const legacy = legacyHash('legacy-password', 'a'.repeat(32), {
      N: 1 << 14,
      r: 8,
      p: 1,
    });

    await expect(verifyPassword('legacy-password', legacy)).resolves.toBe(true);
    await expect(verifyPassword('wrong', legacy)).resolves.toBe(false);
  });

  it('reads the cost parameters from the stored hash', async () => {
    const salt = 'b'.repeat(32);
    const cheap = legacyHash('cheap', salt, { N: 1 << 10, r: 4, p: 2 });
    const [, hashHex] = cheap.split(':');
    const stored = `scrypt$1024$4$2$${salt}$${hashHex}`;

    await expect(verifyPassword('cheap', stored)).resolves.toBe(true);
  });

  it.each([
    'not-a-valid-hash',
    'scrypt$1024$4$2$salt$short',
    `scrypt$1023$4$2$${'c'.repeat(32)}$${'d'.repeat(128)}`,
    `scrypt$99999999$4$2$${'c'.repeat(32)}$${'d'.repeat(128)}`,
    `scrypt$1024$99$2$${'c'.repeat(32)}$${'d'.repeat(128)}`,
    ':deadbeef',
  ])('rejects the malformed stored hash %s', async (stored) => {
    await expect(verifyPassword('x', stored)).resolves.toBe(false);
  });
});
