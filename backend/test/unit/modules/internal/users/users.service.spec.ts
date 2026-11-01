import type { Mocked } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { UsersService } from '@internal/users/users.service';
import { AuthRepository } from '@internal/auth/auth.repository';
import { AuditService } from '@internal/audit/audit.service';
import type { PasswordHasherPort } from '@common/domain/password-hasher.interface';
import { createMock } from '@test/utils/create-mock';
import { createMockUoW } from '@test/utils/mocks';

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    username: 'alice',
    passwordHash: 'hash',
    role: 'MEMBER',
    isActive: true,
    mustChangePassword: false,
    deactivatedAt: null,
    createdBy: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as never;
}

describe('UsersService', () => {
  let service: UsersService;
  let repo: Mocked<AuthRepository>;
  let audit: Mocked<AuditService>;
  let hasher: Mocked<PasswordHasherPort>;

  beforeEach(() => {
    repo = createMock<AuthRepository>();
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);
    hasher = createMock<PasswordHasherPort>();
    hasher.hashPassword.mockResolvedValue('new-hash');
    service = new UsersService(repo, hasher, audit, createMockUoW() as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a user with a one-time password that must be changed', async () => {
    repo.findUserByUsername.mockResolvedValue(null);
    repo.createUser.mockResolvedValue(user({ role: 'MEMBER' }));

    const result = await service.create(
      { id: 'admin', username: 'admin' },
      'alice',
      'MEMBER',
    );

    expect(hasher.hashPassword).toHaveBeenCalledWith(result.temporaryPassword);
    expect(repo.createUser).toHaveBeenCalledWith('alice', 'new-hash', {
      role: 'MEMBER',
      mustChangePassword: true,
      createdBy: 'admin',
    });
    expect(result.user.username).toBe('alice');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.create', actor: 'admin' }),
    );
  });

  it('rejects a duplicate username', async () => {
    repo.findUserByUsername.mockResolvedValue(user());

    await expect(
      service.create({ username: 'admin' }, 'alice', 'MEMBER'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to demote the last active admin', async () => {
    repo.findUserById.mockResolvedValue(user({ role: 'ADMIN' }));
    repo.countActiveAdmins.mockResolvedValue(1);

    await expect(
      service.update({ username: 'admin' }, 'u-1', { role: 'MEMBER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deactivates a user, revokes sessions and audits it', async () => {
    repo.findUserById.mockResolvedValue(user());
    repo.updateUser.mockResolvedValue(user({ isActive: false }));
    repo.deleteSessionsForUser.mockResolvedValue(2);

    const result = await service.update({ username: 'admin' }, 'u-1', {
      isActive: false,
    });

    expect(repo.updateUser).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ isActive: false }),
    );
    expect(repo.deleteSessionsForUser).toHaveBeenCalledWith('u-1');
    expect(result.isActive).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.update' }),
    );
  });

  it('rejects self-deactivation', async () => {
    repo.findUserById.mockResolvedValue(user({ role: 'ADMIN' }));

    await expect(
      service.update({ id: 'u-1', username: 'alice' }, 'u-1', {
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resets a password and revokes every session and API key', async () => {
    repo.findUserById.mockResolvedValue(user());

    const result = await service.resetPassword({ username: 'admin' }, 'u-1');

    expect(result.temporaryPassword.length).toBeGreaterThan(8);
    expect(repo.updatePassword).toHaveBeenCalledWith('u-1', 'new-hash', true);
    expect(repo.deleteSessionsForUser).toHaveBeenCalledWith('u-1');
    expect(repo.revokeApiKeysForOwner).toHaveBeenCalledWith(
      'u-1',
      'password-reset',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.reset-password' }),
    );
  });
});
