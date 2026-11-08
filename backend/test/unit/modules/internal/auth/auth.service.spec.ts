import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import type { Mocked } from 'vitest';
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from '@common/domain/password-hasher.interface';
import { AppConfigService } from '@config/app-config.service';
import {
  AuthRepository,
  type AuthUserRow,
} from '@internal/auth/auth.repository';
import { AuthService } from '@internal/auth/auth.service';
import { createMock } from '@test/utils/create-mock';

describe('AuthService', () => {
  let service: AuthService;
  let mockRepository: Mocked<AuthRepository>;
  let mockHasher: Mocked<PasswordHasherPort>;

  const authUser = (overrides: Partial<AuthUserRow> = {}): AuthUserRow => ({
    id: 'u1',
    username: 'alice',
    passwordHash: `scrypt$65536$8$1$${'a'.repeat(32)}$${'b'.repeat(128)}`,
    role: 'MEMBER',
    isActive: true,
    mustChangePassword: false,
    deactivatedAt: null,
    createdBy: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });

  const mockAppConfig = {
    auth: {
      sessionTtlDays: 7,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    },
  } as unknown as AppConfigService;

  beforeEach(async () => {
    mockRepository = createMock<AuthRepository>();
    mockHasher = createMock<PasswordHasherPort>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: mockRepository },
        { provide: PASSWORD_HASHER, useValue: mockHasher },
        { provide: AppConfigService, useValue: mockAppConfig },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upgrades a legacy password hash on a successful login', async () => {
    mockRepository.findUserByUsername.mockResolvedValue(
      authUser({ passwordHash: `legacy-salt:${'c'.repeat(128)}` }),
    );
    mockHasher.verifyPassword.mockResolvedValue(true);
    mockHasher.hashPassword.mockResolvedValue(
      `scrypt$65536$8$1$${'d'.repeat(32)}$${'e'.repeat(128)}`,
    );
    mockRepository.createSession.mockResolvedValue({
      id: 's1',
      tokenHash: 'tokhash',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      lastSeenAt: new Date(),
      ip: null,
      userAgent: null,
      createdAt: new Date(),
    });

    await service.login('alice', 'secret');

    expect(mockHasher.hashPassword).toHaveBeenCalledWith('secret');
    expect(mockRepository.updatePassword).toHaveBeenCalledWith(
      'u1',
      expect.stringMatching(/^scrypt\$/),
      false,
    );
  });

  it('still logs in when the legacy hash upgrade fails', async () => {
    mockRepository.findUserByUsername.mockResolvedValue(
      authUser({ passwordHash: `legacy-salt:${'c'.repeat(128)}` }),
    );
    mockHasher.verifyPassword.mockResolvedValue(true);
    mockHasher.hashPassword.mockRejectedValue(new Error('boom'));
    mockRepository.createSession.mockResolvedValue({
      id: 's1',
      tokenHash: 'tokhash',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      lastSeenAt: new Date(),
      ip: null,
      userAgent: null,
      createdAt: new Date(),
    });

    const result = await service.login('alice', 'secret');

    expect(result).toEqual(expect.objectContaining({ username: 'alice' }));
    expect(mockRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('returns a session token and username for valid credentials', async () => {
    mockRepository.findUserByUsername.mockResolvedValue(authUser());
    mockHasher.verifyPassword.mockResolvedValue(true);
    mockRepository.createSession.mockResolvedValue({
      id: 's1',
      tokenHash: 'tokhash',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      lastSeenAt: new Date(),
      ip: null,
      userAgent: null,
      createdAt: new Date(),
    });

    const result = (await service.login('alice', 'secret')) as {
      token: string;
      username: string;
      role: string;
      mustChangePassword: boolean;
    };

    expect(result.username).toBe('alice');
    expect(result.role).toBe('MEMBER');
    expect(result.mustChangePassword).toBe(false);
    expect(result.token.length).toBeGreaterThan(0);
    expect(mockRepository.createSession).toHaveBeenCalledTimes(1);
    const [userId, tokenHash, expiresAt] =
      mockRepository.createSession.mock.calls[0];
    expect(userId).toBe('u1');
    expect(tokenHash).toBe(
      createHash('sha256').update(result.token).digest('hex'),
    );
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws UnauthorizedException for an unknown user', async () => {
    mockRepository.findUserByUsername.mockResolvedValue(null);
    mockHasher.verifyPassword.mockResolvedValue(false);

    await expect(service.login('alice', 'secret')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // The dummy hash is verified against so the unknown-user path takes the
    // same time as a wrong password (no username enumeration by timing).
    expect(mockHasher.verifyPassword).toHaveBeenCalledWith(
      'secret',
      expect.stringContaining(':'),
    );
    expect(mockRepository.createSession).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException for a wrong password', async () => {
    mockRepository.findUserByUsername.mockResolvedValue(authUser());
    mockHasher.verifyPassword.mockResolvedValue(false);

    await expect(service.login('alice', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockRepository.createSession).not.toHaveBeenCalled();
  });

  it('rejects a password change with the wrong current password', async () => {
    mockRepository.findUserById.mockResolvedValue(
      authUser({ mustChangePassword: true }),
    );
    mockHasher.verifyPassword.mockResolvedValue(false);

    await expect(
      service.changePassword('u1', 'wrong', 'new-secret'),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('changes the password, revokes old sessions and API keys, and issues a new session', async () => {
    mockRepository.findUserById.mockResolvedValue(
      authUser({ mustChangePassword: true }),
    );
    mockHasher.verifyPassword.mockResolvedValue(true);
    mockHasher.hashPassword.mockResolvedValue('new-hash');

    const result = await service.changePassword('u1', 'old', 'new-secret');

    expect(mockRepository.updatePassword).toHaveBeenCalledWith(
      'u1',
      'new-hash',
      false,
    );
    expect(mockRepository.deleteSessionsForUser).toHaveBeenCalledWith('u1');
    expect(mockRepository.revokeApiKeysForOwner).toHaveBeenCalledWith(
      'u1',
      'password-changed',
    );
    expect(mockRepository.createSession).toHaveBeenCalledTimes(1);
    expect(result.token.length).toBeGreaterThan(0);
  });

  it('lists sessions, marks the current one and revokes others', async () => {
    mockRepository.listSessions.mockResolvedValue([
      {
        id: 's1',
        createdAt: new Date(),
        lastSeenAt: null,
        expiresAt: new Date(),
        ip: null,
        userAgent: null,
      },
      {
        id: 's2',
        createdAt: new Date(),
        lastSeenAt: null,
        expiresAt: new Date(),
        ip: null,
        userAgent: null,
      },
    ] as never);
    mockRepository.revokeAllSessions.mockResolvedValue(1);
    mockRepository.revokeSession.mockResolvedValue(true);

    const sessions = await service.listSessions('u1', 's1');
    expect(sessions[0]?.isCurrent).toBe(true);
    expect(sessions[1]?.isCurrent).toBe(false);

    await service.revokeSession('u1', 's2');
    expect(mockRepository.revokeSession).toHaveBeenCalledWith('s2', 'u1');

    await expect(service.revokeOtherSessions('u1', 's1')).resolves.toBe(1);
  });

  it('logs out by deleting the session for the hashed token', async () => {
    await service.logout('rawtoken');

    expect(mockRepository.deleteSessionByTokenHash).toHaveBeenCalledWith(
      createHash('sha256').update('rawtoken').digest('hex'),
    );
  });
});
