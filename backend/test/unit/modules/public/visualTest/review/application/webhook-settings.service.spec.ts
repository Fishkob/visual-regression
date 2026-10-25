import type { Mocked } from 'vitest';
import { DomainError } from '@common/domain/domain-error';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import { WebhookSettingsService } from '@public/visualTest/review/application/webhook-settings.service';
import { AuditService } from '@internal/audit/audit.service';
import type { WebhookEndpointRow } from '@internal/webhooks/webhook.types';
import { createMock } from '@test/utils/create-mock';

describe('WebhookSettingsService', () => {
  let service: WebhookSettingsService;
  let projects: Mocked<ProjectRepository>;
  let endpoints: Mocked<WebhookEndpointRepository>;
  let deliveries: Mocked<WebhookDeliveryRepository>;
  let dispatch: Mocked<WebhookDispatchService>;
  let audit: Mocked<AuditService>;

  const endpoint = {
    id: 'wh-1',
    projectId: 'project-1',
    url: 'https://hooks.example.com/x',
    secret: 'whsec_1234567890abcdef',
    events: ['review.requested'],
    format: 'json',
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  } satisfies WebhookEndpointRow;

  beforeEach(() => {
    projects = createMock<ProjectRepository>();
    projects.findByName.mockResolvedValue({
      id: 'project-1',
      name: 'shop',
      createdAt: new Date(),
    });
    endpoints = createMock<WebhookEndpointRepository>();
    endpoints.findByProject.mockResolvedValue([endpoint]);
    endpoints.findByIdForProject.mockResolvedValue(endpoint);
    endpoints.create.mockResolvedValue(endpoint);
    endpoints.update.mockResolvedValue(endpoint);
    endpoints.remove.mockResolvedValue(true);
    deliveries = createMock<WebhookDeliveryRepository>();
    deliveries.listForEndpoint.mockResolvedValue([]);
    deliveries.findByIdForEndpoint.mockResolvedValue({
      ...endpoint,
      id: 'del-1',
      endpointId: 'wh-1',
      event: 'review.requested',
      payload: {},
      status: 'FAILED',
      attempts: 5,
      nextAttemptAt: null,
      responseStatus: 500,
      lastError: 'HTTP 500',
      createdAt: new Date(),
      deliveredAt: null,
    });
    dispatch = createMock<WebhookDispatchService>();
    dispatch.enqueueTestEvent.mockResolvedValue(undefined);
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);

    service = new WebhookSettingsService(
      projects,
      endpoints,
      deliveries,
      dispatch,
      audit,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists endpoints with a secret preview, never the secret', async () => {
    const result = await service.list('shop');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'wh-1',
        secretPreview: '****cdef',
      }),
    ]);
    expect(result[0]).not.toHaveProperty('secret');
  });

  it('rejects a blocked URL on create', async () => {
    await expect(
      service.create('shop', {
        url: 'http://169.254.169.254/latest',
        events: ['review.requested'],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(endpoints.create).not.toHaveBeenCalled();
  });

  it('generates a signing secret and returns it once on create', async () => {
    await service.create('shop', {
      url: 'https://hooks.example.com/x',
      events: ['review.requested'],
    });

    expect(endpoints.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        url: 'https://hooks.example.com/x',
        events: ['review.requested'],
        format: 'json',
        secret: expect.stringMatching(/^whsec_/),
      }),
    );
  });

  it('returns a 404 for an endpoint of another project', async () => {
    endpoints.findByIdForProject.mockResolvedValue(null);

    await expect(
      service.update('shop', 'other', { active: false }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('replays only a delivery that belongs to the endpoint', async () => {
    deliveries.findByIdForEndpoint.mockResolvedValue(null);

    await expect(service.replay('shop', 'wh-1', 'del-x')).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
    expect(deliveries.replay).not.toHaveBeenCalled();
  });

  it('queues a synthetic test delivery', async () => {
    await service.sendTest('shop', 'wh-1');

    expect(dispatch.enqueueTestEvent).toHaveBeenCalledWith({
      endpointId: 'wh-1',
      projectName: 'shop',
    });
  });

  it('throws a 404 for an unknown project', async () => {
    projects.findByName.mockResolvedValue(null);

    await expect(service.list('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
