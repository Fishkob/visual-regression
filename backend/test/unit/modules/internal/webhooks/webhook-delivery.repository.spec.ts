import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import {
  WEBHOOK_PROCESSING_LEASE_MINUTES,
  WebhookDeliveryRepository,
} from '@internal/webhooks/webhook-delivery.repository';
import type { WebhookDeliveryRow } from '@internal/webhooks/webhook.types';
import { createMock } from '@test/utils/create-mock';

function sqlText(call: unknown[]): string {
  const first = call[0] as { sql?: string };
  return typeof first?.sql === 'string' ? first.sql : String(first);
}

function sqlValues(call: unknown[]): unknown[] {
  const first = call[0] as { values?: unknown[] };
  return first?.values ?? [];
}

describe('WebhookDeliveryRepository', () => {
  let repository: WebhookDeliveryRepository;
  let mockTxCtx: Mocked<TransactionContext>;
  let mockClient: any;

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
    mockClient = {
      $executeRaw: vi.fn(),
      $queryRawUnsafe: vi.fn(),
      webhookDelivery: { update: vi.fn(), updateMany: vi.fn() },
    };
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
    it('reclaims expired PROCESSING claims before claiming', async () => {
      mockClient.$executeRaw.mockResolvedValue(2);
      mockClient.$queryRawUnsafe.mockResolvedValue([delivery()]);

      await repository.claimDue(20);

      // Two statements: fail the exhausted leases, requeue the rest.
      expect(mockClient.$executeRaw).toHaveBeenCalledTimes(2);
      const requeue = mockClient.$executeRaw.mock.calls[1][0];
      expect(requeue.sql).toContain('UPDATE "WebhookDelivery"');
      expect(requeue.sql).toContain('"claimedAt" = NULL');
      expect(requeue.sql).toContain('"nextAttemptAt" = NOW()');
      expect(requeue.sql).toContain(
        `"status" = 'PROCESSING'::"WebhookDeliveryStatus"`,
      );
      expect(requeue.sql).toContain('COALESCE("claimedAt", "createdAt")');
      expect(requeue.sql).toContain('make_interval(mins => ?)');
      expect(requeue.values).toEqual([WEBHOOK_PROCESSING_LEASE_MINUTES]);
    });

    it('counts a lost lease as an attempt and never deletes the row', async () => {
      mockClient.$executeRaw.mockResolvedValue(1);
      mockClient.$queryRawUnsafe.mockResolvedValue([]);

      await repository.claimDue(10);

      const requeue = mockClient.$executeRaw.mock.calls[1][0];
      expect(requeue.sql).toContain('"attempts" + 1');
      expect(requeue.sql).not.toContain('DELETE');
    });

    it('runs the reclaim before the claim query', async () => {
      mockClient.$executeRaw.mockResolvedValue(0);
      mockClient.$queryRawUnsafe.mockResolvedValue([]);

      await repository.claimDue(10);

      expect(mockClient.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mockClient.$queryRawUnsafe.mock.invocationCallOrder[0],
      );
    });

    it('stamps claimedAt on the claimed rows and returns it', async () => {
      mockClient.$executeRaw.mockResolvedValue(0);
      mockClient.$queryRawUnsafe.mockResolvedValue([delivery()]);

      const rows = await repository.claimDue(20);

      expect(rows).toHaveLength(1);
      const sql = mockClient.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('"claimedAt" = NOW()');
      expect(sql).toContain('RETURNING "id"');
      expect(sql).toContain('"claimedAt"');
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(sql).toContain('LIMIT 20');
    });

    it('keeps the claim bounded even when the caller asks for more', async () => {
      mockClient.$executeRaw.mockResolvedValue(0);
      mockClient.$queryRawUnsafe.mockResolvedValue([]);

      await repository.claimDue(5_000);

      const sql = mockClient.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT 100');
    });

    it('still selects only due PENDING rows', async () => {
      mockClient.$executeRaw.mockResolvedValue(0);
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
    it('counts the lost lease as an attempt and fails an exhausted delivery', async () => {
      mockClient.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

      await expect(repository.reclaimExpired()).resolves.toBe(4);

      expect(mockClient.$executeRaw).toHaveBeenCalledTimes(2);
      const [failCall] = mockClient.$executeRaw.mock.calls;
      const [requeueCall] = mockClient.$executeRaw.mock.calls.slice(1);
      expect(sqlText(failCall)).toContain('"status" = \'FAILED\'');
      expect(sqlText(failCall)).toContain('"attempts" + 1 >=');
      expect(sqlText(requeueCall)).toContain('"status" = \'PENDING\'');
      expect(sqlText(requeueCall)).toContain('"attempts" + 1');
      expect(sqlValues(requeueCall)).toEqual([
        WEBHOOK_PROCESSING_LEASE_MINUTES,
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
