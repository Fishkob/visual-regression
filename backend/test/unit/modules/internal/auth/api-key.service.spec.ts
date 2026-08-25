import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { AuthRepository } from '@internal/auth/auth.repository';
import { ApiKeyService } from '@internal/auth/api-key.service';
import { createMock } from '@test/utils/create-mock';

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

  it('generates a raw key and stores only its sha256 hash', async () => {
    mockRepository.createApiKey.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      revokedAt: null,
    });

    const result = await service.createKey('ci-upload');

    expect(result.rawKey.length).toBeGreaterThanOrEqual(40);
    const expectedHash = createHash('sha256')
      .update(result.rawKey)
      .digest('hex');
    expect(mockRepository.createApiKey).toHaveBeenCalledWith(
      'ci-upload',
      expectedHash,
    );
    expect(mockRepository.createApiKey.mock.calls[0][1]).not.toBe(
      result.rawKey,
    );
  });

  it('rejects a revoked key', async () => {
    mockRepository.findApiKeyByHash.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      revokedAt: new Date('2026-01-01'),
    });

    await expect(service.resolveApiKey('any')).resolves.toBeNull();
  });

  it('returns the id and name of an active key', async () => {
    mockRepository.findApiKeyByHash.mockResolvedValue({
      id: 'k1',
      name: 'ci',
      revokedAt: null,
    });

    await expect(service.resolveApiKey('any')).resolves.toEqual({
      id: 'k1',
      name: 'ci',
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
});
