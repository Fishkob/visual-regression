import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionContext } from '@/prisma/transaction-context';
import {
  WEBHOOK_PROCESSING_LEASE_MINUTES,
  WebhookDeliveryRepository,
} from '@internal/webhooks/webhook-delivery.repository';
import type { WebhookDeliveryRow } from '@internal/webhooks/webhook.types';
import { createMock } from '@test/utils/create-mock';

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
      webhookDelivery: { update: vi.fn() },
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
    it('reclaims expired PROCESSING claims back to PENDING before claiming', async () => {
      mockClient.$executeRaw.mockResolvedValue(2);
      mockClient.$queryRawUnsafe.mockResolvedValue([delivery()]);

      await repository.claimDue(20);

      expect(mockClient.$executeRaw).toHaveBeenCalledTimes(1);
      const reclaim = mockClient.$executeRaw.mock.calls[0][0];
      expect(reclaim.sql).toContain('UPDATE "WebhookDelivery"');
      expect(reclaim.sql).toContain('"claimedAt" = NULL');
      expect(reclaim.sql).toContain('"nextAttemptAt" = NOW()');
      expect(reclaim.sql).toContain(
        `"status" = 'PROCESSING'::"WebhookDeliveryStatus"`,
      );
      expect(reclaim.sql).toContain('COALESCE("claimedAt", "createdAt")');
      expect(reclaim.sql).toContain('make_interval(mins => ?)');
      expect(reclaim.values).toEqual([WEBHOOK_PROCESSING_LEASE_MINUTES]);
    });

    it('does not touch the attempt counter when reclaiming a lease', async () => {
      mockClient.$executeRaw.mockResolvedValue(1);
      mockClient.$queryRawUnsafe.mockResolvedValue([]);

      await repository.claimDue(10);

      const reclaim = mockClient.$executeRaw.mock.calls[0][0];
      expect(reclaim.sql).not.toContain('"attempts"');
      expect(reclaim.sql).not.toContain('DELETE');
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
    it('returns how many abandoned claims were requeued', async () => {
      mockClient.$executeRaw.mockResolvedValue(4);

      await expect(repository.reclaimExpired()).resolves.toBe(4);
    });
  });

  describe('terminal and retry updates', () => {
    it('clears the lease when marking a delivery delivered', async () => {
      mockClient.webhookDelivery.update.mockResolvedValue({});

      await repository.markDelivered('del-1', 200);

      expect(mockClient.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'del-1' },
        data: expect.objectContaining({
          status: 'DELIVERED',
          responseStatus: 200,
          claimedAt: null,
        }),
      });
    });

    it('clears the lease when marking a terminal failure', async () => {
      mockClient.webhookDelivery.update.mockResolvedValue({});

      await repository.markTerminalFailure('del-1', 5, 'HTTP 500', 500);

      expect(mockClient.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'del-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          attempts: 5,
          claimedAt: null,
        }),
      });
    });

    it('clears the lease when scheduling a retry', async () => {
      mockClient.webhookDelivery.update.mockResolvedValue({});
      const next = new Date('2026-01-01T00:00:00Z');

      await repository.markForRetry('del-1', 2, 'HTTP 503', 503, next);

      expect(mockClient.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'del-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: 2,
          nextAttemptAt: next,
          claimedAt: null,
        }),
      });
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
});
