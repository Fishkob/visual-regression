import { hashPassword, verifyPassword } from '@internal/auth/password-hasher';

describe('password-hasher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces a salted hash in salt:hash form', async () => {
    const out = await hashPassword('correct horse');
    expect(out).toContain(':');
    const [salt] = out.split(':');
    expect(salt.length).toBeGreaterThan(0);
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

  it('rejects a malformed stored hash', async () => {
    await expect(verifyPassword('x', 'not-a-valid-hash')).resolves.toBe(false);
  });
});
