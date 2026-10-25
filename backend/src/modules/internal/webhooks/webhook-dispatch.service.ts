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

  async enqueueReviewRequested(input: {
    testId: string;
    comparisonId: string;
    kind: string;
    variant: WebhookVariant;
    mismatchPixelCount: number;
  }): Promise<number> {
    const context = await this.context.findTestContext(input.testId);
    if (!context) return 0;
    return this.enqueueForProject(context.projectId, 'review.requested', {
      event: 'review.requested',
      occurredAt: new Date().toISOString(),
      project: { name: context.projectName },
      test: { name: context.testName, kind: context.kind },
      branch: context.branchName,
      variant: input.variant,
      comparison: {
        id: input.comparisonId,
        mismatchPixelCount: input.mismatchPixelCount,
        kind: input.kind,
      },
      links: {
        review: this.reviewLink(
          context.projectName,
          context.testName,
          context.branchName,
        ),
      },
    });
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
  }): Promise<number> {
    const project = await this.context.findProjectByName(input.projectName);
    if (!project) return 0;
    return this.enqueueForProject(project.id, 'comparison.approved', {
      event: 'comparison.approved',
      occurredAt: new Date().toISOString(),
      project: { name: project.name },
      test: { name: input.testName, kind: input.kind },
      branch: input.branchName ?? null,
      variant: input.variant,
      comparison: {
        id: input.comparisonId,
        mismatchPixelCount: input.mismatchPixelCount,
        kind: input.kind,
      },
      approvedBy: input.approvedBy,
      links: {
        review: this.reviewLink(
          project.name,
          input.testName,
          input.branchName ?? undefined,
        ),
      },
    });
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
