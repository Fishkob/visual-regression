import type { Mocked } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from '@internal/users/users.service';
import { AuthRepository } from '@internal/auth/auth.repository';
import {
  UserInviteRepository,
  type UserInviteRow,
} from '@internal/users/user-invite.repository';
import { AuditService } from '@internal/audit/audit.service';
import { invitePassword } from '@internal/users/user-invite';
import { hashToken } from '@internal/auth/token-hash';
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

function invite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i-1',
    userId: 'u-1',
    tokenHash: hashToken('token'),
    createdBy: 'admin',
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    createdAt: new Date(),
    user: {
      id: 'u-1',
      username: 'alice',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: true,
    },
    ...overrides,
  } as UserInviteRow;
}

describe('UsersService', () => {
  let service: UsersService;
  let repo: Mocked<AuthRepository>;
  let invites: Mocked<UserInviteRepository>;
  let audit: Mocked<AuditService>;
  let hasher: Mocked<PasswordHasherPort>;

  beforeEach(() => {
    repo = createMock<AuthRepository>();
    invites = createMock<UserInviteRepository>();
    invites.replace.mockResolvedValue(invite());
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);
    hasher = createMock<PasswordHasherPort>();
    hasher.hashPassword.mockResolvedValue('new-hash');
    service = new UsersService(repo, invites, hasher, audit, createMockUoW());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a user whose password lives in the invite link only', async () => {
    repo.findUserByUsername.mockResolvedValue(null);
    repo.createUser.mockResolvedValue(
      user({ role: 'MEMBER', mustChangePassword: true }),
    );

    const result = await service.create(
      { id: 'admin', username: 'admin' },
      'alice',
      'MEMBER',
    );

    // The password is derived from the token and hashed; neither the plaintext
    // nor a reversibly stored form reaches the database.
    expect(hasher.hashPassword).toHaveBeenCalledWith(
      invitePassword(result.invite.token),
    );
    expect(repo.createUser).toHaveBeenCalledWith('alice', 'new-hash', {
      role: 'MEMBER',
      mustChangePassword: true,
      createdBy: 'admin',
    });
    expect(invites.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        tokenHash: hashToken(result.invite.token),
        createdBy: 'admin',
      }),
    );
    expect(result.user.username).toBe('alice');
    expect(result.invite.expiresAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.create',
        actor: 'admin',
        metadata: expect.objectContaining({ username: 'alice' }),
      }),
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

  it('resets a password into a fresh invite link and revokes every session and API key', async () => {
    repo.findUserById.mockResolvedValue(user());

    const result = await service.resetPassword({ username: 'admin' }, 'u-1');

    expect(hasher.hashPassword).toHaveBeenCalledWith(
      invitePassword(result.invite.token),
    );
    expect(repo.updatePassword).toHaveBeenCalledWith('u-1', 'new-hash', true);
    expect(repo.deleteSessionsForUser).toHaveBeenCalledWith('u-1');
    expect(repo.revokeApiKeysForOwner).toHaveBeenCalledWith(
      'u-1',
      'password-reset',
    );
    // A reset replaces the outstanding link rather than adding a second one.
    expect(invites.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        tokenHash: hashToken(result.invite.token),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.reset-password' }),
    );
  });

  describe('peekInvite', () => {
    it('answers who a pending link belongs to without consuming it', async () => {
      invites.findByTokenHash.mockResolvedValue(invite());

      const preview = await service.peekInvite('token');

      expect(preview).toEqual({
        username: 'alice',
        role: 'MEMBER',
        expiresAt: expect.any(Date),
        status: 'pending',
      });
      expect(invites.findByTokenHash).toHaveBeenCalledWith(hashToken('token'));
      expect(invites.consume).not.toHaveBeenCalled();
    });

    it('reports a link that was already revealed as used', async () => {
      invites.findByTokenHash.mockResolvedValue(
        invite({ consumedAt: new Date() }),
      );

      await expect(service.peekInvite('token')).resolves.toEqual(
        expect.objectContaining({ status: 'used' }),
      );
    });

    it('rejects a token no invite carries', async () => {
      invites.findByTokenHash.mockResolvedValue(null);

      await expect(service.peekInvite('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('claimInvite', () => {
    it('reveals the derived password once and records the reveal', async () => {
      invites.findByTokenHash.mockResolvedValue(invite());
      invites.consume.mockResolvedValue(true);

      const revealed = await service.claimInvite('token', { ip: '10.0.0.1' });

      expect(revealed).toEqual({
        username: 'alice',
        temporaryPassword: invitePassword('token'),
      });
      expect(invites.consume).toHaveBeenCalledWith('i-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: null,
          action: 'user.invite-redeem',
          targetId: 'u-1',
        }),
      );
    });

    it('refuses a link that was already revealed', async () => {
      invites.findByTokenHash.mockResolvedValue(
        invite({ consumedAt: new Date() }),
      );

      await expect(service.claimInvite('token')).rejects.toBeInstanceOf(
        GoneException,
      );
      expect(invites.consume).not.toHaveBeenCalled();
    });

    it('refuses an expired link', async () => {
      invites.findByTokenHash.mockResolvedValue(
        invite({ expiresAt: new Date(Date.now() - 1_000) }),
      );

      await expect(service.claimInvite('token')).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('refuses a second reveal when the consume loses the race', async () => {
      invites.findByTokenHash.mockResolvedValue(invite());
      invites.consume.mockResolvedValue(false);

      await expect(service.claimInvite('token')).rejects.toBeInstanceOf(
        GoneException,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a token no invite carries', async () => {
      invites.findByTokenHash.mockResolvedValue(null);

      await expect(service.claimInvite('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
