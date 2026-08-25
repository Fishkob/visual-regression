import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AuthRepository } from '@internal/auth/auth.repository';
import { createMock } from '@test/utils/create-mock';

describe('AuthRepository', () => {
  let repository: AuthRepository;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      user: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
      session: {
        create: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      apiKey: { create: vi.fn(), findUnique: vi.fn() },
    };

    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', {
      get: () => mockClient,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRepository,
        { provide: PrismaConnection, useValue: mockConnection },
      ],
    }).compile();

    repository = module.get(AuthRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds a user by username', async () => {
    mockClient.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
    });

    const result = await repository.findUserByUsername('alice');

    expect(mockClient.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'alice' },
    });
    expect(result).toEqual({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
    });
  });

  it('finds a user by id', async () => {
    mockClient.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
    });

    const result = await repository.findUserById('u1');

    expect(mockClient.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
    });
    expect(result).toEqual({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
    });
  });

  it('creates a user with a hashed password', async () => {
    mockClient.user.create.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
    });

    const result = await repository.createUser('alice', 'salt:hash');

    expect(mockClient.user.create).toHaveBeenCalledWith({
      data: { username: 'alice', passwordHash: 'salt:hash' },
    });
    expect(result).toEqual({
      id: 'u1',
      username: 'alice',
      passwordHash: 'salt:hash',
    });
  });

  it('creates a session with a hashed token', async () => {
    const expiresAt = new Date('2026-09-22');
    mockClient.session.create.mockResolvedValue({
      id: 's1',
      tokenHash: 'tokenhash',
      userId: 'u1',
      expiresAt,
    });

    const result = await repository.createSession('u1', 'tokenhash', expiresAt);

    expect(mockClient.session.create).toHaveBeenCalledWith({
      data: { userId: 'u1', tokenHash: 'tokenhash', expiresAt },
    });
    expect(result).toEqual({
      id: 's1',
      tokenHash: 'tokenhash',
      userId: 'u1',
      expiresAt,
    });
  });

  it('finds a session by token hash', async () => {
    mockClient.session.findUnique.mockResolvedValue({
      id: 's1',
      tokenHash: 'tokenhash',
      userId: 'u1',
      expiresAt: new Date('2099-01-01'),
    });

    const result = await repository.findSessionByTokenHash('tokenhash');

    expect(mockClient.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'tokenhash' },
    });
    expect(result).toEqual({
      id: 's1',
      tokenHash: 'tokenhash',
      userId: 'u1',
      expiresAt: new Date('2099-01-01'),
    });
  });

  it('deletes a session by token hash', async () => {
    mockClient.session.delete.mockResolvedValue({ id: 's1' });

    await repository.deleteSessionByTokenHash('tokenhash');

    expect(mockClient.session.delete).toHaveBeenCalledWith({
      where: { tokenHash: 'tokenhash' },
    });
  });

  it('extends a session expiry (sliding sessions)', async () => {
    mockClient.session.update.mockResolvedValue({
      id: 's1',
      tokenHash: 'tokenhash',
      userId: 'u1',
      expiresAt: new Date('2026-09-22'),
    });

    const expiresAt = new Date('2026-09-22');
    await repository.extendSessionExpiry('tokenhash', expiresAt);

    expect(mockClient.session.update).toHaveBeenCalledWith({
      where: { tokenHash: 'tokenhash' },
      data: { expiresAt },
    });
  });

  it('creates an api key with a hashed key', async () => {
    mockClient.apiKey.create.mockResolvedValue({
      id: 'k1',
      name: 'ci-upload',
      revokedAt: null,
    });

    const result = await repository.createApiKey('ci-upload', 'keyhash');

    expect(mockClient.apiKey.create).toHaveBeenCalledWith({
      data: { name: 'ci-upload', keyHash: 'keyhash' },
    });
    expect(result).toEqual({ id: 'k1', name: 'ci-upload', revokedAt: null });
  });

  it('finds an api key by hash', async () => {
    mockClient.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      name: 'ci-upload',
      revokedAt: null,
    });

    const result = await repository.findApiKeyByHash('keyhash');

    expect(mockClient.apiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: 'keyhash' },
    });
    expect(result).toEqual({ id: 'k1', name: 'ci-upload', revokedAt: null });
  });

  it('counts users (for bootstrap check)', async () => {
    mockClient.user.count.mockResolvedValue(0);

    await expect(repository.countUsers()).resolves.toBe(0);
  });
});
