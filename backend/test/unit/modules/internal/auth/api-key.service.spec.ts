import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { AuthRepository, type ApiKeyRow } from '@internal/auth/auth.repository';
import { ApiKeyService } from '@internal/auth/api-key.service';
import { createMock } from '@test/utils/create-mock';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function makeRow(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: 'k1',
    name: 'ci-upload',
    keyHash: 'hash',
    keyHint: '7f3a',
    ownerId: 'u1',
    scopes: ['upload', 'read', 'approve'],
    projectNames: [],
    owner: { username: 'alice' },
    createdBy: 'alice',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    replacedById: null,
    ...overrides,
  };
}

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let mockRepository: Mocked<AuthRepository>;

  beforeEach(async () => {
    mockRepository = createMock<AuthRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: AuthRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get(ApiKeyService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createKey', () => {
    it('defaults a new key to upload-only and records its owner', async () => {
      mockRepository.createApiKey.mockResolvedValue(
        makeRow({ scopes: ['upload'] }),
      );

      const result = await service.createKey({
        name: 'ci-upload',
        ownerId: 'u1',
        createdBy: 'alice',
      });

      expect(mockRepository.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'u1',
          scopes: ['upload'],
          projectNames: [],
        }),
      );
      expect(result.scopes).toEqual(['upload']);
      expect(result.projectNames).toEqual([]);
    });

    it('stores explicit scopes and a project allowlist', async () => {
      mockRepository.createApiKey.mockResolvedValue(
        makeRow({ scopes: ['read'], projectNames: ['checkout'] }),
      );

      await service.createKey({
        name: 'reader',
        scopes: ['read'],
        projectNames: ['checkout'],
      });

      expect(mockRepository.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: ['read'],
          projectNames: ['checkout'],
        }),
      );
    });

    it('generates a raw key and stores only its sha256 hash', async () => {
      mockRepository.createApiKey.mockResolvedValue(makeRow());

      const result = await service.createKey({ name: 'ci-upload' });

      expect(result.rawKey.length).toBeGreaterThanOrEqual(40);
      const expectedHash = createHash('sha256')
        .update(result.rawKey)
        .digest('hex');
      expect(mockRepository.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ci-upload',
          keyHash: expectedHash,
          keyHint: result.rawKey.slice(-4),
          expiresAt: null,
        }),
      );
      expect(mockRepository.createApiKey.mock.calls[0][0].keyHash).not.toBe(
        result.rawKey,
      );
    });

    it('never returns the key hash to the caller', async () => {
      mockRepository.createApiKey.mockResolvedValue(makeRow());

      const result = await service.createKey({ name: 'ci-upload' });

      expect(result).not.toHaveProperty('keyHash');
    });

    it('records the creating user', async () => {
      mockRepository.createApiKey.mockResolvedValue(makeRow());

      await service.createKey({ name: 'ci-upload', createdBy: 'alice' });

      expect(mockRepository.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'alice' }),
      );
    });

    it('turns expiresInDays into an absolute expiry', async () => {
      mockRepository.createApiKey.mockResolvedValue(makeRow());

      const result = await service.createKey({
        name: 'ci-upload',
        expiresInDays: 30,
      });

      const expiresAt = result.expiresAt!;
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS);
    });

    it('issues a key without expiry when none is requested', async () => {
      mockRepository.createApiKey.mockResolvedValue(makeRow());

      const result = await service.createKey({ name: 'ci-upload' });

      expect(result.expiresAt).toBeNull();
    });
  });

  describe('listKeys', () => {
    it('derives active, revoked and expired status', async () => {
      mockRepository.listApiKeys.mockResolvedValue([
        makeRow({ id: 'active' }),
        makeRow({
          id: 'revoked',
          revokedAt: new Date('2026-02-01T00:00:00Z'),
          revokedReason: 'leaked',
        }),
        makeRow({
          id: 'expired',
          expiresAt: new Date(Date.now() - DAY_MS),
        }),
      ]);

      const result = await service.listKeys();

      expect(result.map((key) => key.status)).toEqual([
        'active',
        'revoked',
        'expired',
      ]);
    });

    it('does not expose the key hash', async () => {
      mockRepository.listApiKeys.mockResolvedValue([makeRow()]);

      const [key] = await service.listKeys();

      expect(key).not.toHaveProperty('keyHash');
    });

    it('keeps a key with a future expiry active', async () => {
      mockRepository.listApiKeys.mockResolvedValue([
        makeRow({ expiresAt: new Date(Date.now() + DAY_MS) }),
      ]);

      const [key] = await service.listKeys();

      expect(key.status).toBe('active');
    });
  });

  describe('revokeKey', () => {
    it('stamps the revocation time and reason', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(makeRow());
      mockRepository.revokeApiKey.mockResolvedValue(
        makeRow({ revokedAt: new Date('2026-03-01T00:00:00Z') }),
      );

      const result = await service.revokeKey('k1', ' leaked in logs ');

      expect(mockRepository.revokeApiKey).toHaveBeenCalledWith(
        'k1',
        expect.any(Date),
        'leaked in logs',
      );
      expect(result.status).toBe('revoked');
    });

    it('stores null when no reason is given', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(makeRow());
      mockRepository.revokeApiKey.mockResolvedValue(
        makeRow({ revokedAt: new Date() }),
      );

      await service.revokeKey('k1');

      expect(mockRepository.revokeApiKey).toHaveBeenCalledWith(
        'k1',
        expect.any(Date),
        null,
      );
    });

    it('reports the existing state for an already revoked key', async () => {
      const revoked = makeRow({ revokedAt: new Date('2026-02-01') });
      mockRepository.findApiKeyById.mockResolvedValue(revoked);

      const result = await service.revokeKey('k1');

      expect(mockRepository.revokeApiKey).not.toHaveBeenCalled();
      expect(result.status).toBe('revoked');
    });

    it('rejects an unknown key', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(null);

      await expect(service.revokeKey('missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('deleteKey', () => {
    it('deletes a key that was never used', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(makeRow());

      await expect(service.deleteKey('k1')).resolves.toEqual({
        success: true,
      });
      expect(mockRepository.deleteApiKey).toHaveBeenCalledWith('k1');
    });

    it('refuses to delete a key that has authenticated a request', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(
        makeRow({ lastUsedAt: new Date() }),
      );

      await expect(service.deleteKey('k1')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(mockRepository.deleteApiKey).not.toHaveBeenCalled();
    });

    it('rejects an unknown key', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(null);

      await expect(service.deleteKey('missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('rotateKey', () => {
    it('inherits scopes, project allowlist and owner', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(
        makeRow({ scopes: ['upload'], projectNames: ['checkout'] }),
      );
      mockRepository.replaceApiKey.mockResolvedValue(
        makeRow({ scopes: ['upload'], projectNames: ['checkout'] }),
      );

      await service.rotateKey('k1');

      expect(mockRepository.replaceApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'u1',
          scopes: ['upload'],
          projectNames: ['checkout'],
        }),
        'k1',
        expect.anything(),
      );
    });

    it('creates a successor and retires the predecessor in one call', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(makeRow());
      mockRepository.replaceApiKey.mockResolvedValue(makeRow({ id: 'k2' }));

      const result = await service.rotateKey('k1', { createdBy: 'alice' });

      expect(mockRepository.replaceApiKey).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ci-upload', createdBy: 'alice' }),
        'k1',
        {
          revokedAt: expect.any(Date),
          expiresAt: null,
          revokedReason: 'rotated',
        },
      );
      expect(result.id).toBe('k2');
      expect(result.replacesId).toBe('k1');
      expect(result.replacesKeyHint).toBe('7f3a');
      expect(result.graceEndsAt).toBeNull();
    });

    it('keeps the predecessor valid during the grace window', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(makeRow());
      mockRepository.replaceApiKey.mockResolvedValue(makeRow({ id: 'k2' }));

      const result = await service.rotateKey('k1', { graceMinutes: 60 });

      const retirement = mockRepository.replaceApiKey.mock.calls[0][2];
      expect(retirement.revokedAt).toBeNull();
      expect(retirement.expiresAt).toBeInstanceOf(Date);
      expect(result.graceEndsAt).toEqual(retirement.expiresAt);
    });

    it('carries the remaining lifetime over to the successor', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(
        makeRow({ expiresAt: new Date(Date.now() + 3.5 * DAY_MS) }),
      );
      mockRepository.replaceApiKey.mockResolvedValue(makeRow({ id: 'k2' }));

      const result = await service.rotateKey('k1');

      expect(result.expiresAt!.getTime()).toBeGreaterThan(
        Date.now() + 3 * DAY_MS,
      );
      expect(result.expiresAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + 4 * DAY_MS,
      );
    });

    it('grants a never-expiring successor on an explicit null', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(
        makeRow({ expiresAt: new Date(Date.now() + 3 * DAY_MS) }),
      );
      mockRepository.replaceApiKey.mockResolvedValue(makeRow({ id: 'k2' }));

      const result = await service.rotateKey('k1', { expiresInDays: null });

      expect(result.expiresAt).toBeNull();
      expect(
        mockRepository.replaceApiKey.mock.calls[0][0].expiresAt,
      ).toBeNull();
    });

    it('honours an explicit lifetime instead of inheriting one', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(
        makeRow({ expiresAt: new Date(Date.now() + 3 * DAY_MS) }),
      );
      mockRepository.replaceApiKey.mockResolvedValue(makeRow({ id: 'k2' }));

      const result = await service.rotateKey('k1', { expiresInDays: 90 });

      expect(result.expiresAt!.getTime()).toBeGreaterThan(
        Date.now() + 89 * DAY_MS,
      );
      expect(result.expiresAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + 90 * DAY_MS,
      );
    });

    it('rejects a revoked key', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(
        makeRow({ revokedAt: new Date() }),
      );

      await expect(service.rotateKey('k1')).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      expect(mockRepository.replaceApiKey).not.toHaveBeenCalled();
    });

    it('rejects an expired key', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(
        makeRow({ expiresAt: new Date(Date.now() - DAY_MS) }),
      );

      await expect(service.rotateKey('k1')).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
    });

    it('rejects an unknown key', async () => {
      mockRepository.findApiKeyById.mockResolvedValue(null);

      await expect(service.rotateKey('missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('resolveApiKey', () => {
    it('returns the scopes and allowlist for the guard', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(makeRow());

      await expect(service.resolveApiKey('raw')).resolves.toEqual({
        id: 'k1',
        name: 'ci-upload',
        ownerId: 'u1',
        scopes: ['upload', 'read', 'approve'],
        projectNames: [],
      });
    });

    it('rejects a revoked key', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(
        makeRow({ revokedAt: new Date('2026-01-01') }),
      );

      await expect(service.resolveApiKey('any')).resolves.toBeNull();
    });

    it('rejects an expired key', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(
        makeRow({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.resolveApiKey('any')).resolves.toBeNull();
    });

    it('returns the id and name of an active key', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(makeRow());

      await expect(service.resolveApiKey('any')).resolves.toEqual({
        id: 'k1',
        name: 'ci-upload',
        ownerId: 'u1',
        scopes: ['upload', 'read', 'approve'],
        projectNames: [],
      });
    });

    it('rejects an unknown key hash', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(null);

      await expect(service.resolveApiKey('any')).resolves.toBeNull();
    });

    it('hashes the key consistently for the lookup', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(null);

      await service.resolveApiKey('any');

      expect(mockRepository.findApiKeyByHash).toHaveBeenCalledWith(
        createHash('sha256').update('any').digest('hex'),
      );
    });

    it('records the first use', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(makeRow());

      await service.resolveApiKey('any');

      expect(mockRepository.touchApiKeyLastUsed).toHaveBeenCalledWith(
        'k1',
        expect.any(Date),
      );
    });

    it('does not write usage again within the same hour', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(
        makeRow({ lastUsedAt: new Date(Date.now() - 10 * 60 * 1000) }),
      );

      await service.resolveApiKey('any');

      expect(mockRepository.touchApiKeyLastUsed).not.toHaveBeenCalled();
    });

    it('writes usage again once the recorded use is stale', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(
        makeRow({ lastUsedAt: new Date(Date.now() - 2 * HOUR_MS) }),
      );

      await service.resolveApiKey('any');

      expect(mockRepository.touchApiKeyLastUsed).toHaveBeenCalledTimes(1);
    });

    it('still authenticates when the usage write fails', async () => {
      mockRepository.findApiKeyByHash.mockResolvedValue(makeRow());
      mockRepository.touchApiKeyLastUsed.mockRejectedValue(
        new Error('db unavailable'),
      );

      await expect(service.resolveApiKey('any')).resolves.toEqual({
        id: 'k1',
        name: 'ci-upload',
        ownerId: 'u1',
        scopes: ['upload', 'read', 'approve'],
        projectNames: [],
      });
    });
  });
});
