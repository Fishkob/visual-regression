import type { Mocked } from 'vitest';
import { WebhookDispatcher } from '@internal/webhooks/webhook-dispatcher.service';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import { WebhookSender } from '@internal/webhooks/webhook-sender.service';
import { WEBHOOK_MAX_ATTEMPTS } from '@internal/webhooks/webhook-backoff';
import type { AppLoggerService } from '@common/logging/app-logger.service';
import type { AppConfigService } from '@config/app-config.service';
import type {
  WebhookDeliveryRow,
  WebhookEndpointRow,
} from '@internal/webhooks/webhook.types';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('WebhookDispatcher', () => {
  let dispatcher: WebhookDispatcher;
  let deliveries: Mocked<WebhookDeliveryRepository>;
  let endpoints: Mocked<WebhookEndpointRepository>;
  let sender: Mocked<WebhookSender>;

  const endpoint = {
    id: 'wh-1',
    projectId: 'project-1',
    url: 'https://example.com/hook',
    secret: 'whsec_test',
    events: ['review.requested'],
    format: 'json',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies WebhookEndpointRow;

  function delivery(overrides: Partial<WebhookDeliveryRow> = {}) {
    return {
      id: 'del-1',
      endpointId: 'wh-1',
      event: 'review.requested',
      payload: { event: 'review.requested' },
      status: 'PROCESSING',
      attempts: 0,
      nextAttemptAt: null,
      responseStatus: null,
      lastError: null,
      createdAt: new Date(),
      deliveredAt: null,
      ...overrides,
    } satisfies WebhookDeliveryRow;
  }

  beforeEach(() => {
    deliveries = createMock<WebhookDeliveryRepository>();
    endpoints = createMock<WebhookEndpointRepository>();
    sender = createMock<WebhookSender>();
    endpoints.findById.mockResolvedValue(endpoint);
    deliveries.claimDue.mockResolvedValue([]);

    dispatcher = new WebhookDispatcher(
      { nodeMode: 'worker' } as AppConfigService,
      deliveries,
      endpoints,
      sender,
      createMockLogger() as unknown as AppLoggerService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers a claimed row and marks it delivered', async () => {
    deliveries.claimDue.mockResolvedValue([delivery()]);
    sender.send.mockResolvedValue({ ok: true, status: 200 });

    const result = await dispatcher.runOnce();

    expect(sender.send).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ id: 'del-1' }),
    );
    expect(deliveries.markDelivered).toHaveBeenCalledWith('del-1', 200);
    expect(result).toEqual({ delivered: 1, retried: 0, failed: 0 });
  });

  it('requeues a failed delivery with backoff', async () => {
    deliveries.claimDue.mockResolvedValue([delivery({ attempts: 0 })]);
    sender.send.mockResolvedValue({
      ok: false,
      status: 500,
      error: 'HTTP 500',
    });

    const result = await dispatcher.runOnce();

    expect(deliveries.markForRetry).toHaveBeenCalledWith(
      'del-1',
      1,
      'HTTP 500',
      500,
      expect.any(Date),
    );
    expect(deliveries.markTerminalFailure).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, retried: 1, failed: 0 });
  });

  it('marks the delivery failed after the last attempt', async () => {
    deliveries.claimDue.mockResolvedValue([
      delivery({ attempts: WEBHOOK_MAX_ATTEMPTS - 1 }),
    ]);
    sender.send.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'HTTP 503',
    });

    const result = await dispatcher.runOnce();

    expect(deliveries.markTerminalFailure).toHaveBeenCalledWith(
      'del-1',
      WEBHOOK_MAX_ATTEMPTS,
      'HTTP 503',
      503,
    );
    expect(deliveries.markForRetry).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, retried: 0, failed: 1 });
  });

  it('fails the delivery without sending when the endpoint is disabled', async () => {
    deliveries.claimDue.mockResolvedValue([delivery()]);
    endpoints.findById.mockResolvedValue({ ...endpoint, active: false });

    const result = await dispatcher.runOnce();

    expect(sender.send).not.toHaveBeenCalled();
    expect(deliveries.markTerminalFailure).toHaveBeenCalledWith(
      'del-1',
      1,
      'Endpoint is disabled or deleted',
      null,
    );
    expect(result.failed).toBe(1);
  });

  it('fails the delivery without sending when the endpoint was deleted', async () => {
    deliveries.claimDue.mockResolvedValue([delivery()]);
    endpoints.findById.mockResolvedValue(null);

    await dispatcher.runOnce();

    expect(sender.send).not.toHaveBeenCalled();
    expect(deliveries.markTerminalFailure).toHaveBeenCalled();
  });

  it('returns zero counts for an empty claim', async () => {
    const result = await dispatcher.runOnce();

    expect(result).toEqual({ delivered: 0, retried: 0, failed: 0 });
    expect(sender.send).not.toHaveBeenCalled();
  });
});
