import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { WebhookContextRepository } from '@internal/webhooks/webhook-context.repository';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import type {
  WebhookPayload,
  WebhookSubscriptionEvent,
  WebhookVariant,
} from '@internal/webhooks/webhook.types';

// Single builder of webhook payloads and the outbox write. Domain paths call
// the named enqueue helpers from inside their StateChangeWorkflow change, so
// the delivery rows commit with the change. The payload carries a dashboard
// link, never a presigned storage URL.
@Injectable()
export class WebhookDispatchService {
  constructor(
    private readonly endpoints: WebhookEndpointRepository,
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly context: WebhookContextRepository,
    private readonly config: AppConfigService,
  ) {}

  async enqueueForProject(
    projectId: string,
    event: WebhookSubscriptionEvent,
    payload: WebhookPayload,
  ): Promise<number> {
    const endpoints = await this.endpoints.findActiveForProjectEvent(
      projectId,
      event,
    );
    if (endpoints.length === 0) return 0;
    return this.deliveries.createMany(
      endpoints.map((endpoint) => endpoint.id),
      event,
      payload,
    );
  }

  // One payload skeleton for every event: the four builders used to repeat the
  // same eight fields (and the event name three times each), which is why a new
  // event cost a copy-paste instead of a variant. The event-specific fields are
  // the extra; everything else is the base every delivery shares.
  private buildPayload(
    event: WebhookSubscriptionEvent,
    base: {
      projectName: string;
      testName: string;
      kind: string;
      branchName: string | null;
      runKey?: string | null;
    },
    extra: Partial<
      Pick<
        WebhookPayload,
        | 'variant'
        | 'comparison'
        | 'approvedBy'
        | 'reason'
        | 'note'
        | 'assignee'
        | 'dueAt'
        | 'comment'
        | 'job'
      >
    > = {},
  ): WebhookPayload {
    return {
      event,
      occurredAt: new Date().toISOString(),
      project: { name: base.projectName },
      test: { name: base.testName, kind: base.kind },
      branch: base.branchName,
      ...extra,
      links: {
        review: this.reviewLink(
          base.projectName,
          base.testName,
          base.branchName,
        ),
        // Only a run-scoped event carries the second link: the rest have no run
        // to point at, and a guessed one would be a dead link.
        ...(base.runKey
          ? {
              run: `${this.baseUrl()}/projects/${encodeURIComponent(base.projectName)}/runs/${encodeURIComponent(base.runKey)}`,
            }
          : {}),
      },
    };
  }

  async enqueueReviewRequested(input: {
    testId: string;
    comparisonId: string;
    kind: string;
    variant: WebhookVariant;
    mismatchPixelCount: number;
  }): Promise<number> {
    const context = await this.context.findTestContext(input.testId);
    if (!context) return 0;
    return this.enqueueForProject(
      context.projectId,
      'review.requested',
      this.buildPayload(
        'review.requested',
        {
          projectName: context.projectName,
          testName: context.testName,
          kind: context.kind,
          branchName: context.branchName,
        },
        {
          variant: input.variant,
          comparison: {
            id: input.comparisonId,
            mismatchPixelCount: input.mismatchPixelCount,
            kind: input.kind,
          },
        },
      ),
    );
  }

  async enqueueReviewAssigned(input: {
    projectName: string;
    testName: string;
    branchName: string;
    kind: string;
    assignee: string;
    dueAt: string | null;
  }): Promise<number> {
    const project = await this.context.findProjectByName(input.projectName);
    if (!project) return 0;
    return this.enqueueForProject(
      project.id,
      'review.assigned',
      this.buildPayload(
        'review.assigned',
        {
          projectName: project.name,
          testName: input.testName,
          kind: input.kind,
          branchName: input.branchName,
        },
        { assignee: input.assignee, dueAt: input.dueAt },
      ),
    );
  }

  async enqueueReviewComment(input: {
    projectName: string;
    testName: string;
    branchName: string | null;
    kind: string;
    author: string;
    body: string;
    comparisonId: string | null;
  }): Promise<number> {
    const project = await this.context.findProjectByName(input.projectName);
    if (!project) return 0;
    return this.enqueueForProject(
      project.id,
      'review.comment',
      this.buildPayload(
        'review.comment',
        {
          projectName: project.name,
          testName: input.testName,
          kind: input.kind,
          branchName: input.branchName,
        },
        {
          comment: {
            author: input.author,
            body: input.body,
            comparisonId: input.comparisonId,
          },
        },
      ),
    );
  }

  async enqueueComparisonApproved(input: {
    projectName: string;
    testName: string;
    branchName?: string | null;
    kind: string;
    variant: WebhookVariant;
    comparisonId: string;
    mismatchPixelCount: number;
    approvedBy: string;
    reason?: string | null;
    note?: string | null;
  }): Promise<number> {
    const project = await this.context.findProjectByName(input.projectName);
    if (!project) return 0;
    return this.enqueueForProject(
      project.id,
      'comparison.approved',
      this.buildPayload(
        'comparison.approved',
        {
          projectName: project.name,
          testName: input.testName,
          kind: input.kind,
          branchName: input.branchName ?? null,
        },
        {
          variant: input.variant,
          comparison: {
            id: input.comparisonId,
            mismatchPixelCount: input.mismatchPixelCount,
            kind: input.kind,
          },
          approvedBy: input.approvedBy,
          // The decision context is optional: an approval without a reason/note
          // keeps the pre-existing payload shape (JSON drops undefined).
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.note ? { note: input.note } : {}),
        },
      ),
    );
  }

  // A comparison that died in the worker: no comparison row exists, so the
  // payload carries the job instead. Published through the queue's failure
  // observer (ADR-076) — this method is called from the observer's own
  // transaction, never from a StateChangeWorkflow change.
  async enqueueJobFailed(input: {
    testId: string;
    jobId: string;
    error: string;
    attempts: number;
    maxAttempts: number;
    runKey: string | null;
  }): Promise<number> {
    const context = await this.context.findTestContext(input.testId);
    if (!context) return 0;
    return this.enqueueForProject(
      context.projectId,
      'job.failed',
      this.buildPayload(
        'job.failed',
        {
          projectName: context.projectName,
          testName: context.testName,
          kind: context.kind,
          branchName: context.branchName,
          runKey: input.runKey,
        },
        {
          job: {
            id: input.jobId,
            error: input.error,
            attempts: input.attempts,
            maxAttempts: input.maxAttempts,
          },
        },
      ),
    );
  }

  // Synthetic delivery for the endpoint test button: one row for one endpoint.
  async enqueueTestEvent(input: {
    endpointId: string;
    projectName: string;
  }): Promise<void> {
    await this.deliveries.create(input.endpointId, 'test', {
      event: 'test',
      occurredAt: new Date().toISOString(),
      project: { name: input.projectName },
      branch: null,
      links: { review: `${this.baseUrl()}/projects` },
    });
  }

  private reviewLink(
    projectName: string,
    testName: string,
    branch?: string | null,
  ): string {
    const base = `${this.baseUrl()}/projects/${encodeURIComponent(projectName)}/tests/${encodeURIComponent(testName)}`;
    return branch ? `${base}?branch=${encodeURIComponent(branch)}` : base;
  }

  private baseUrl(): string {
    return this.config.appPublicUrl.replace(/\/+$/, '');
  }
}
