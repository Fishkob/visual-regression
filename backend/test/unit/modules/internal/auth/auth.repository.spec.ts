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
        deleteMany: vi.fn(),
        update: vi.fn(),
      },
      apiKey: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    mockClient.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(mockClient),
    );

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

  it('deletes a session by token hash with a no-op for a missing session', async () => {
    mockClient.session.deleteMany.mockResolvedValue({ count: 0 });

    await repository.deleteSessionByTokenHash('tokenhash');

    expect(mockClient.session.deleteMany).toHaveBeenCalledWith({
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
    const input = {
      name: 'ci-upload',
      keyHash: 'keyhash',
      keyHint: '7f3a',
      createdBy: 'alice',
      expiresAt: null,
    };

    const result = await repository.createApiKey(input);

    expect(mockClient.apiKey.create).toHaveBeenCalledWith({ data: input });
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

  it('finds an api key by id', async () => {
    mockClient.apiKey.findUnique.mockResolvedValue({ id: 'k1' });

    await repository.findApiKeyById('k1');

    expect(mockClient.apiKey.findUnique).toHaveBeenCalledWith({
      where: { id: 'k1' },
    });
  });

  it('lists api keys newest first', async () => {
    mockClient.apiKey.findMany.mockResolvedValue([{ id: 'k1' }]);

    const result = await repository.listApiKeys();

    expect(mockClient.apiKey.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([{ id: 'k1' }]);
  });

  it('revokes an api key', async () => {
    const revokedAt = new Date('2026-03-01');
    mockClient.apiKey.update.mockResolvedValue({ id: 'k1', revokedAt });

    await repository.revokeApiKey('k1', revokedAt, 'leaked');

    expect(mockClient.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'k1' },
      data: { revokedAt, revokedReason: 'leaked' },
    });
  });

  it('records the last use of a key', async () => {
    const at = new Date('2026-03-01');
    mockClient.apiKey.update.mockResolvedValue({ id: 'k1' });

    await repository.touchApiKeyLastUsed('k1', at);

    expect(mockClient.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'k1' },
      data: { lastUsedAt: at },
    });
  });

  it('deletes an api key', async () => {
    mockClient.apiKey.delete.mockResolvedValue({ id: 'k1' });

    await repository.deleteApiKey('k1');

    expect(mockClient.apiKey.delete).toHaveBeenCalledWith({
      where: { id: 'k1' },
    });
  });

  it('creates the successor and retires the predecessor in one transaction', async () => {
    const created = {
      name: 'ci-upload',
      keyHash: 'newhash',
      keyHint: 'ab12',
      createdBy: 'alice',
      expiresAt: null,
    };
    const revokedAt = new Date('2026-03-01');
    mockClient.apiKey.create.mockResolvedValue({ id: 'k2' });
    mockClient.apiKey.update.mockResolvedValue({ id: 'k1' });

    const result = await repository.replaceApiKey(created, 'k1', {
      revokedAt,
      expiresAt: null,
      revokedReason: 'rotated',
    });

    expect(mockClient.$transaction).toHaveBeenCalled();
    expect(mockClient.apiKey.create).toHaveBeenCalledWith({ data: created });
    expect(mockClient.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'k1' },
      data: {
        revokedAt,
        expiresAt: null,
        revokedReason: 'rotated',
        replacedById: 'k2',
      },
    });
    expect(result).toEqual({ id: 'k2' });
  });

  it('counts users (for bootstrap check)', async () => {
    mockClient.user.count.mockResolvedValue(0);

    await expect(repository.countUsers()).resolves.toBe(0);
  });
});
