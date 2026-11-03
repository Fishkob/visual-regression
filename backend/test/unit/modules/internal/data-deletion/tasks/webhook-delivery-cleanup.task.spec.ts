import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppConfigService } from '@config/app-config.service';
import { WebhookDeliveryCleanupTask } from '@internal/data-deletion/tasks/webhook-delivery-cleanup.task';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { createMock } from '@test/utils/create-mock';

describe('WebhookDeliveryCleanupTask', () => {
  let task: WebhookDeliveryCleanupTask;
  let mockClient: { webhookDelivery: { deleteMany: ReturnType<typeof vi.fn> } };

  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    mockClient = { webhookDelivery: { deleteMany: vi.fn() } };
    mockClient.webhookDelivery.deleteMany.mockResolvedValue({ count: 0 });

    const connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryCleanupTask,
        { provide: PrismaConnection, useValue: connection },
        {
          provide: AppConfigService,
          useValue: { webhookRetention: { days: 30 } } as AppConfigService,
        },
      ],
    }).compile();

    task = module.get(WebhookDeliveryCleanupTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes only terminal deliveries older than the retention window', async () => {
    mockClient.webhookDelivery.deleteMany.mockResolvedValue({ count: 12 });

    const result = await task.execute();

    const { where } = mockClient.webhookDelivery.deleteMany.mock.calls[0][0];
    expect(where.status).toEqual({ in: ['DELIVERED', 'FAILED'] });
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    const ageDays =
      (Date.now() - (where.createdAt.lt as Date).getTime()) / DAY_MS;
    expect(ageDays).toBeCloseTo(30, 1);
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        {
          name: 'cleanup_webhook_deliveries_deleted',
          value: 12,
        },
      ]),
    );
  });

  it('runs under its own maintenance lock', () => {
    expect(task.lockId).toBe(MAINTENANCE_LOCK_IDS.webhookDeliveryCleanup);
  });
});
