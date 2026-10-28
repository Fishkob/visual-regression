import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminApiKeysController } from '@internal/admin/admin-api-keys.controller';
import { AdminAuthGuard } from '@internal/dlq/admin-auth.guard';
import { ApiKeyService } from '@internal/auth/api-key.service';
import { AppConfigService } from '@config/app-config.service';
import { createMock } from '@test/utils/create-mock';

describe('AdminApiKeysController', () => {
  let controller: AdminApiKeysController;
  let apiKeyService: Mocked<ApiKeyService>;

  beforeEach(async () => {
    apiKeyService = createMock<ApiKeyService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminApiKeysController],
      providers: [
        { provide: ApiKeyService, useValue: apiKeyService },
        AdminAuthGuard,
        { provide: AppConfigService, useValue: { admin: { apiKey: 'k' } } },
      ],
    }).compile();

    controller = module.get(AdminApiKeysController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a key and returns the raw key once', async () => {
    apiKeyService.createKey.mockResolvedValue({
      id: 'k1',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: '7f3a',
      scopes: ['upload'],
      projectNames: [],
      expiresAt: null,
    });

    const result = await controller.create({ name: 'ci-upload' });

    expect(apiKeyService.createKey).toHaveBeenCalledWith('admin-api-key', {
      name: 'ci-upload',
      expiresInDays: null,
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

  it('passes requested scopes and project names through to the service', async () => {
    apiKeyService.createKey.mockResolvedValue({
      id: 'k1',
      name: 'dev-seed',
      rawKey: 'raw-secret',
      keyHint: '7f3a',
      scopes: ['upload', 'read', 'approve', 'admin'],
      projectNames: ['shop'],
      expiresAt: null,
    });

    await controller.create({
      name: 'dev-seed',
      scopes: ['upload', 'read', 'approve', 'admin'],
      projectNames: ['shop'],
    });

    expect(apiKeyService.createKey).toHaveBeenCalledWith('admin-api-key', {
      name: 'dev-seed',
      expiresInDays: null,
      scopes: ['upload', 'read', 'approve', 'admin'],
      projectNames: ['shop'],
    });
  });

  it('passes an optional expiry through to the service', async () => {
    apiKeyService.createKey.mockResolvedValue({
      id: 'k1',
      name: 'ci-upload',
      rawKey: 'raw-secret',
      keyHint: '7f3a',
      scopes: ['upload'],
      projectNames: [],
      expiresAt: new Date('2027-01-01'),
    });

    await controller.create({ name: 'ci-upload', expiresInDays: 90 });

    expect(apiKeyService.createKey).toHaveBeenCalledWith('admin-api-key', {
      name: 'ci-upload',
      expiresInDays: 90,
    });
  });
});
