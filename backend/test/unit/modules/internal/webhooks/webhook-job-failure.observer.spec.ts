import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookJobFailureObserver } from '@internal/webhooks/webhook-job-failure.observer';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { createMock } from '@test/utils/create-mock';

describe('WebhookJobFailureObserver', () => {
  let observer: WebhookJobFailureObserver;
  let dispatch: Mocked<WebhookDispatchService>;
  let uow: Mocked<PrismaUnitOfWork>;

  const notice = {
    jobId: 'job-9',
    testId: 'test-1',
    error: 'Screenshot download failed',
    attempts: 5,
    maxAttempts: 5,
    runKey: 'run-7',
  };

  beforeEach(async () => {
    dispatch = createMock<WebhookDispatchService>();
    dispatch.enqueueJobFailed.mockResolvedValue(1);
    uow = createMock<PrismaUnitOfWork>();
    uow.execute.mockImplementation(<T>(fn: () => Promise<T>) => fn());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookJobFailureObserver,
        { provide: WebhookDispatchService, useValue: dispatch },
        { provide: PrismaUnitOfWork, useValue: uow },
      ],
    }).compile();

    observer = module.get(WebhookJobFailureObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the outbox row inside the transaction it owns', async () => {
    await observer.onJobFailed(notice);

    expect(uow.execute).toHaveBeenCalledTimes(1);
    expect(dispatch.enqueueJobFailed).toHaveBeenCalledWith(notice);
  });

  it('propagates a write failure instead of hiding it from the queue', async () => {
    dispatch.enqueueJobFailed.mockRejectedValue(
      new Error('outbox unavailable'),
    );

    await expect(observer.onJobFailed(notice)).rejects.toThrow(
      'outbox unavailable',
    );
  });
});
