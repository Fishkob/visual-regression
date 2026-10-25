import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type {
  WebhookEndpointRow,
  WebhookSubscriptionEvent,
} from '@internal/webhooks/webhook.types';

export interface CreateWebhookEndpointInput {
  projectId: string;
  url: string;
  secret: string;
  events: WebhookSubscriptionEvent[];
  format: 'json' | 'slack';
}

export interface UpdateWebhookEndpointInput {
  url?: string;
  secret?: string;
  events?: WebhookSubscriptionEvent[];
  format?: 'json' | 'slack';
  active?: boolean;
}

// Endpoint administration is a standalone write (no state-change transaction);
// the dispatcher reads the same rows on its own. Deliberately no
// assertWritable: creating an endpoint changes no test status.
@Injectable()
export class WebhookEndpointRepository extends BaseRepository {
  async create(input: CreateWebhookEndpointInput): Promise<WebhookEndpointRow> {
    return this.client.webhookEndpoint.create({ data: input });
  }

  async findByProject(projectId: string): Promise<WebhookEndpointRow[]> {
    return this.client.webhookEndpoint.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<WebhookEndpointRow | null> {
    return this.client.webhookEndpoint.findUnique({ where: { id } });
  }

  async findByIdForProject(
    projectId: string,
    id: string,
  ): Promise<WebhookEndpointRow | null> {
    return this.client.webhookEndpoint.findFirst({
      where: { id, projectId },
    });
  }

  // The dispatcher's fan-out query: active endpoints of the project that
  // subscribed to this event.
  async findActiveForProjectEvent(
    projectId: string,
    event: WebhookSubscriptionEvent,
  ): Promise<WebhookEndpointRow[]> {
    return this.client.webhookEndpoint.findMany({
      where: { projectId, active: true, events: { has: event } },
    });
  }

  async update(
    id: string,
    data: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpointRow> {
    return this.client.webhookEndpoint.update({ where: { id }, data });
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.client.webhookEndpoint.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }
}
