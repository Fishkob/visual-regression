import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import type {
  FailedJobNotice,
  IJobFailureObserver,
} from '@common/domain/job-failure.interface';

// The adapter between the queue's failure seam and the webhook outbox. The queue
// publishes after its own FAILED write committed and holds no transaction, so
// the transaction is opened here: every outbox write rides one
// (`WebhookDeliveryRepository.createMany` asserts it), and a notification is a
// report about the failure — it commits or fails on its own, without the job row
// (ADR-076).
@Injectable()
export class WebhookJobFailureObserver implements IJobFailureObserver {
  constructor(
    private readonly dispatch: WebhookDispatchService,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  async onJobFailed(notice: FailedJobNotice): Promise<void> {
    await this.uow.execute(() =>
      this.dispatch.enqueueJobFailed({
        testId: notice.testId,
        jobId: notice.jobId,
        error: notice.error,
        attempts: notice.attempts,
        maxAttempts: notice.maxAttempts,
        runKey: notice.runKey,
      }),
    );
  }
}
