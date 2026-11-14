import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WEBHOOK_MAX_ATTEMPTS } from '@internal/webhooks/webhook-backoff';
import type { WebhookDeliveryRow } from '@internal/webhooks/webhook.types';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    $executeRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    webhookDelivery: { update: vi.fn(), updateMany: vi.fn() },
  };
}

describe('WebhookDeliveryRepository', () => {
  let repository: WebhookDeliveryRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: ReturnType<typeof makeMockClient>;

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
      claimedAt: new Date(),
      createdAt: new Date(),
      deliveredAt: null,
      ...overrides,
    } satisfies WebhookDeliveryRow;
  }

  beforeEach(async () => {
    mockClient = makeMockClient();
    mockTxCtx = createMock<TransactionContext>();
    Object.defineProperty(mockTxCtx, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryRepository,
        { provide: TransactionContext, useValue: mockTxCtx },
      ],
    }).compile();

    repository = module.get(WebhookDeliveryRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('claimDue', () => {
    it('reclaims expired claims before claiming the due rows', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });
      mockClient.$queryRawUnsafe.mockResolvedValue([delivery()]);

      await repository.claimDue(10);

      // Two updates — fail the exhausted leases, requeue the rest — before the
      // claim: a row whose dispatcher died must not block the queue.
      expect(mockClient.webhookDelivery.updateMany).toHaveBeenCalledTimes(2);
      expect(
        mockClient.webhookDelivery.updateMany.mock.invocationCallOrder[1],
      ).toBeLessThan(mockClient.$queryRawUnsafe.mock.invocationCallOrder[0]);
    });

    it('stamps claimedAt on the claimed rows and returns it', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });
      mockClient.$queryRawUnsafe.mockResolvedValue([delivery()]);

      const rows = await repository.claimDue(20);

      expect(rows).toHaveLength(1);
      const sql = mockClient.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('"claimedAt" = NOW()');
      expect(sql).toContain('RETURNING "id"');
      expect(sql).toContain('"claimedAt"');
      expect(sql).toContain('LIMIT 20');
      // The lock itself is not asserted here: a string test on `FOR UPDATE SKIP
      // LOCKED` stays green for the bug it is meant to catch (ADR-059). It is
      // proven by the race case in
      // `test/e2e/notifications/webhook-delivery-lease.e2e-spec.ts`, which
      // fails with duplicate ids when the clause is removed.
    });

    it('keeps the claim bounded even when the caller asks for more', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });
      mockClient.$queryRawUnsafe.mockResolvedValue([]);

      await repository.claimDue(5_000);

      const sql = mockClient.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT 100');
    });

    it('still selects only due PENDING rows', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });
      mockClient.$queryRawUnsafe.mockResolvedValue([]);

      await repository.claimDue(10);

      const sql = mockClient.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain(`"status" = 'PENDING'::"WebhookDeliveryStatus"`);
      expect(sql).toContain(
        '("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())',
      );
    });
  });

  describe('reclaimExpired', () => {
    // A lost lease must consume the delivery's retry budget: both statements
    // increment attempts, and an exhausted one is failed instead of requeued.
    it('counts the lost lease as an attempt and fails an exhausted delivery', async () => {
      mockClient.webhookDelivery.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 4 });

      await expect(repository.reclaimExpired()).resolves.toBe(4);

      const calls = mockClient.webhookDelivery.updateMany.mock.calls;
      expect(calls).toHaveLength(2);
      const [failCall, requeueCall] = calls;

      expect(failCall[0].data).toEqual(
        expect.objectContaining({
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: 'Delivery lease expired',
        }),
      );
      expect(failCall[0].where).toEqual(
        expect.objectContaining({
          attempts: { gte: WEBHOOK_MAX_ATTEMPTS - 1 },
        }),
      );

      expect(requeueCall[0].data).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          attempts: { increment: 1 },
          claimedAt: null,
          nextAttemptAt: expect.any(Date),
        }),
      );
      // The requeue takes whatever is left PROCESSING — any attempt filter here
      // would strand a row the fail-statement missed.
      expect(requeueCall[0].where).not.toHaveProperty('attempts');
    });

    it('treats a claim without claimedAt as expired by its createdAt', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });

      await repository.reclaimExpired();

      const [failCall] = mockClient.webhookDelivery.updateMany.mock.calls;
      const { where } = failCall[0] as { where: Record<string, unknown> };
      expect(where.status).toBe('PROCESSING');
      expect(where.OR).toEqual([
        { claimedAt: { lt: expect.any(Date) } },
        { claimedAt: null, createdAt: { lt: expect.any(Date) } },
      ]);
    });
  });

  describe('terminal and retry updates', () => {
    it('clears the lease when marking a delivery delivered', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });

      await repository.markDelivered('del-1', 200);

      expect(mockClient.webhookDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'del-1', status: 'PROCESSING' },
        data: expect.objectContaining({
          status: 'DELIVERED',
          responseStatus: 200,
          claimedAt: null,
        }),
      });
    });

    it('clears the lease when marking a terminal failure', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });

      await repository.markTerminalFailure('del-1', 5, 'HTTP 500', 500);

      expect(mockClient.webhookDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'del-1', status: 'PROCESSING' },
        data: expect.objectContaining({
          status: 'FAILED',
          attempts: 5,
          claimedAt: null,
        }),
      });
    });

    it('clears the lease when scheduling a retry', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });
      const next = new Date('2026-01-01T00:00:00Z');

      await repository.markForRetry('del-1', 2, 'HTTP 503', 503, next);

      expect(mockClient.webhookDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'del-1', status: 'PROCESSING' },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: 2,
          nextAttemptAt: next,
          claimedAt: null,
        }),
      });
    });

    it('tolerates a write that matched no PROCESSING row', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.markDelivered('del-gone', 200)).resolves.toBe(
        undefined,
      );
      await expect(
        repository.markTerminalFailure('del-gone', 1, 'HTTP 500', 500),
      ).resolves.toBe(undefined);
      await expect(
        repository.markForRetry(
          'del-gone',
          1,
          'HTTP 500',
          500,
          new Date('2026-01-01T00:00:00Z'),
        ),
      ).resolves.toBe(undefined);
    });

    it('clears the lease when replaying a delivery', async () => {
      mockClient.webhookDelivery.update.mockResolvedValue({});

      await repository.replay('del-1');

      expect(mockClient.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'del-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: 0,
          claimedAt: null,
        }),
      });
    });
  });

  describe('releaseClaims', () => {
    it('returns the claimed rows to PENDING and clears the lease', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 2 });

      await expect(repository.releaseClaims(['del-1', 'del-2'])).resolves.toBe(
        2,
      );

      expect(mockClient.webhookDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['del-1', 'del-2'] }, status: 'PROCESSING' },
        data: { status: 'PENDING', claimedAt: null },
      });
    });

    it('leaves rows alone that are no longer PROCESSING', async () => {
      mockClient.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.releaseClaims(['del-1'])).resolves.toBe(0);
    });

    it('skips the write for an empty id list', async () => {
      await expect(repository.releaseClaims([])).resolves.toBe(0);

      expect(mockClient.webhookDelivery.updateMany).not.toHaveBeenCalled();
    });
  });
});
