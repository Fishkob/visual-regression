import type { Mocked } from 'vitest';
import { WebhookDispatcher } from '@internal/webhooks/webhook-dispatcher.service';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import { WebhookSender } from '@internal/webhooks/webhook-sender.service';
import { WEBHOOK_MAX_ATTEMPTS } from '@internal/webhooks/webhook-backoff';
import { WORKER_TIMING } from '@common/utils/worker-timing';
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
  let logger: Mocked<AppLoggerService>;

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
      claimedAt: null,
      createdAt: new Date(),
      deliveredAt: null,
      ...overrides,
    } satisfies WebhookDeliveryRow;
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  beforeEach(() => {
    deliveries = createMock<WebhookDeliveryRepository>();
    endpoints = createMock<WebhookEndpointRepository>();
    sender = createMock<WebhookSender>();
    logger = createMockLogger();
    endpoints.findById.mockResolvedValue(endpoint);
    deliveries.claimDue.mockResolvedValue([]);

    dispatcher = new WebhookDispatcher(
      { nodeMode: 'worker' } as AppConfigService,
      deliveries,
      endpoints,
      sender,
      logger as unknown as AppLoggerService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it('keeps processing the batch when one delivery write throws', async () => {
    deliveries.claimDue.mockResolvedValue([
      delivery({ id: 'del-1' }),
      delivery({ id: 'del-2' }),
    ]);
    sender.send.mockResolvedValue({ ok: true, status: 200 });
    deliveries.markDelivered
      .mockRejectedValueOnce(new Error('P2025: Record to update not found'))
      .mockResolvedValue(undefined);

    const result = await dispatcher.runOnce();

    expect(deliveries.markDelivered).toHaveBeenCalledTimes(2);
    expect(deliveries.markDelivered).toHaveBeenLastCalledWith('del-2', 200);
    expect(result).toEqual({ delivered: 1, retried: 0, failed: 1 });
    expect(logger.error).toHaveBeenCalledWith(
      'Webhook delivery write failed',
      expect.any(String),
      expect.objectContaining({ deliveryId: 'del-1' }),
    );
  });

  it('releases the unprocessed claims when the in-flight batch outlives the drain budget', async () => {
    vi.useFakeTimers();
    const hungSend = deferred<{ ok: boolean; status: number }>();
    deliveries.claimDue.mockResolvedValue([
      delivery({ id: 'del-done' }),
      delivery({ id: 'del-open' }),
    ]);
    sender.send
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockReturnValueOnce(hungSend.promise);
    deliveries.markDelivered.mockResolvedValue(undefined);
    deliveries.releaseClaims.mockResolvedValue(1);

    dispatcher.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(sender.send).toHaveBeenCalledTimes(2);

    const destroy = dispatcher.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(WORKER_TIMING.drainTimeoutMs);
    await destroy;

    expect(deliveries.releaseClaims).toHaveBeenCalledWith(['del-open']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('released 1 of 1'),
      expect.objectContaining({ deliveryIds: ['del-open'] }),
    );

    hungSend.resolve({ ok: true, status: 200 });
    await vi.advanceTimersByTimeAsync(0);
  });

  it('releases nothing when the in-flight batch finishes inside the drain budget', async () => {
    vi.useFakeTimers();
    deliveries.claimDue.mockResolvedValue([delivery()]);
    sender.send.mockResolvedValue({ ok: true, status: 200 });

    dispatcher.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    const destroy = dispatcher.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(WORKER_TIMING.drainTimeoutMs);
    await destroy;

    expect(deliveries.markDelivered).toHaveBeenCalledWith('del-1', 200);
    expect(deliveries.releaseClaims).not.toHaveBeenCalled();
  });
});
