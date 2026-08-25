import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import type { Mocked } from 'vitest';
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from '@common/domain/password-hasher.interface';
import { AppConfigService } from '@config/app-config.service';
import { AuthRepository } from '@internal/auth/auth.repository';
import { AuthService } from '@internal/auth/auth.service';
import { createMock } from '@test/utils/create-mock';

describe('AuthService', () => {
  let service: AuthService;
  let mockRepository: Mocked<AuthRepository>;
  let mockHasher: Mocked<PasswordHasherPort>;

  const mockAppConfig = {
    auth: { sessionTtlDays: 7, sessionTtlMs: 7 * 24 * 60 * 60 * 1000 },
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

  it('returns a session token and username for valid credentials', async () => {
    mockRepository.findUserByUsername.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
    });
    mockHasher.verifyPassword.mockResolvedValue(true);
    mockRepository.createSession.mockResolvedValue({
      id: 's1',
      tokenHash: 'tokhash',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.login('alice', 'secret');

    expect(result.username).toBe('alice');
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
    mockRepository.findUserByUsername.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
    });
    mockHasher.verifyPassword.mockResolvedValue(false);

    await expect(service.login('alice', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockRepository.createSession).not.toHaveBeenCalled();
  });

  it('logs out by deleting the session for the hashed token', async () => {
    await service.logout('rawtoken');

    expect(mockRepository.deleteSessionByTokenHash).toHaveBeenCalledWith(
      createHash('sha256').update('rawtoken').digest('hex'),
    );
  });
});
