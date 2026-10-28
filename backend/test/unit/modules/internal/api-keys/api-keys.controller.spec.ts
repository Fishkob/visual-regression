import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from '@internal/api-keys/api-keys.controller';
import type { AuthenticatedRequest } from '@common/http/authenticated-request';
import { ApiKeyService, type ApiKeyView } from '@internal/auth/api-key.service';
import { createMock } from '@test/utils/create-mock';

function makeView(overrides: Partial<ApiKeyView> = {}): ApiKeyView {
  return {
    id: 'k1',
    name: 'ci-upload',
    keyHint: '7f3a',
    ownerId: 'u1',
    ownerUsername: 'alice',
    scopes: ['upload'],
    projectNames: [],
    createdBy: 'alice',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    replacedById: null,
    status: 'active',
    ...overrides,
  };
}

const request = {
  auth: { username: 'alice', userId: 'u1' },
} as AuthenticatedRequest;

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let apiKeyService: Mocked<ApiKeyService>;

  beforeEach(async () => {
    apiKeyService = createMock<ApiKeyService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [{ provide: ApiKeyService, useValue: apiKeyService }],
    }).compile();

    controller = module.get(ApiKeysController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists keys without their hash', async () => {
    apiKeyService.listKeys.mockResolvedValue([makeView()]);

    const result = await controller.findAll();

    expect(result).toEqual([makeView()]);
    expect(result[0]).not.toHaveProperty('keyHash');
  });

  it('attributes a new key to the logged-in user', async () => {
    apiKeyService.createKey.mockResolvedValue({
      id: 'k1',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: '7f3a',
      scopes: ['upload'],
      projectNames: [],
      expiresAt: null,
    });

    const result = await controller.create({ name: 'ci-upload' }, request);

    expect(apiKeyService.createKey).toHaveBeenCalledWith('alice', {
      name: 'ci-upload',
      expiresInDays: null,
      createdBy: 'alice',
      ownerId: 'u1',
      scopes: undefined,
      projectNames: undefined,
    });
    expect(result).toEqual({
      id: 'k1',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: '7f3a',
      scopes: ['upload'],
      projectNames: [],
      expiresAt: null,
    });
  });

  it('returns only the create-once fields for a rotated key', async () => {
    const expiresAt = new Date('2027-01-01T00:00:00Z');
    apiKeyService.rotateKey.mockResolvedValue({
      id: 'k2',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: 'ab12',
      scopes: ['upload'],
      projectNames: [],
      expiresAt,
      replacesId: 'k1',
      replacesKeyHint: '7f3a',
      graceEndsAt: null,
    });

    const result = await controller.rotate('k1', { graceMinutes: 30 }, request);

    expect(apiKeyService.rotateKey).toHaveBeenCalledWith('alice', 'k1', {
      graceMinutes: 30,
      expiresInDays: undefined,
      createdBy: 'alice',
    });
    expect(result).toEqual({
      id: 'k2',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: 'ab12',
      scopes: ['upload'],
      projectNames: [],
      expiresAt,
    });
    expect(result).not.toHaveProperty('replacesId');
  });

  it('passes an explicit null expiry through instead of dropping it', async () => {
    apiKeyService.rotateKey.mockResolvedValue({
      id: 'k2',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: 'ab12',
      scopes: ['upload'],
      projectNames: [],
      expiresAt: null,
      replacesId: 'k1',
      replacesKeyHint: '7f3a',
      graceEndsAt: null,
    });

    await controller.rotate('k1', { expiresInDays: null }, request);

    expect(apiKeyService.rotateKey).toHaveBeenCalledWith(
      'alice',
      'k1',
      expect.objectContaining({ expiresInDays: null }),
    );
  });

  it('revokes a key with the given reason', async () => {
    apiKeyService.revokeKey.mockResolvedValue(
      makeView({ status: 'revoked', revokedAt: new Date() }),
    );

    const result = await controller.revoke('k1', { reason: 'leaked' }, request);

    expect(apiKeyService.revokeKey).toHaveBeenCalledWith(
      'alice',
      'k1',
      'leaked',
    );
    expect(result.status).toBe('revoked');
  });

  it('revokes without a reason', async () => {
    apiKeyService.revokeKey.mockResolvedValue(
      makeView({ status: 'revoked', revokedAt: new Date() }),
    );

    await controller.revoke('k1', {}, request);

    expect(apiKeyService.revokeKey).toHaveBeenCalledWith('alice', 'k1', null);
  });

  it('deletes a key', async () => {
    apiKeyService.deleteKey.mockResolvedValue({ success: true });

    await expect(controller.remove('k1', request)).resolves.toEqual({
      success: true,
    });
    expect(apiKeyService.deleteKey).toHaveBeenCalledWith('alice', 'k1');
  });
});
