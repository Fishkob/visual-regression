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

const request = { auth: { username: 'alice' } } as AuthenticatedRequest;

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
      expiresAt: null,
    });

    const result = await controller.create({ name: 'ci-upload' }, request);

    expect(apiKeyService.createKey).toHaveBeenCalledWith({
      name: 'ci-upload',
      expiresInDays: null,
      createdBy: 'alice',
    });
    expect(result).toEqual({
      id: 'k1',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: '7f3a',
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
      expiresAt,
      replacesId: 'k1',
      replacesKeyHint: '7f3a',
      graceEndsAt: null,
    });

    const result = await controller.rotate('k1', { graceMinutes: 30 }, request);

    expect(apiKeyService.rotateKey).toHaveBeenCalledWith('k1', {
      graceMinutes: 30,
      expiresInDays: undefined,
      createdBy: 'alice',
    });
    expect(result).toEqual({
      id: 'k2',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: 'ab12',
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
      expiresAt: null,
      replacesId: 'k1',
      replacesKeyHint: '7f3a',
      graceEndsAt: null,
    });

    await controller.rotate('k1', { expiresInDays: null }, request);

    expect(apiKeyService.rotateKey).toHaveBeenCalledWith(
      'k1',
      expect.objectContaining({ expiresInDays: null }),
    );
  });

  it('revokes a key with the given reason', async () => {
    apiKeyService.revokeKey.mockResolvedValue(
      makeView({ status: 'revoked', revokedAt: new Date() }),
    );

    const result = await controller.revoke('k1', { reason: 'leaked' });

    expect(apiKeyService.revokeKey).toHaveBeenCalledWith('k1', 'leaked');
    expect(result.status).toBe('revoked');
  });

  it('revokes without a reason', async () => {
    apiKeyService.revokeKey.mockResolvedValue(
      makeView({ status: 'revoked', revokedAt: new Date() }),
    );

    await controller.revoke('k1', {});

    expect(apiKeyService.revokeKey).toHaveBeenCalledWith('k1', null);
  });

  it('deletes a key', async () => {
    apiKeyService.deleteKey.mockResolvedValue({ success: true });

    await expect(controller.remove('k1')).resolves.toEqual({ success: true });
    expect(apiKeyService.deleteKey).toHaveBeenCalledWith('k1');
  });
});
