import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';

import { DomainError } from '@common/domain/domain-error';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import { assertSafeWebhookUrl } from '@internal/webhooks/webhook-url';
import { generateWebhookSecret } from '@internal/webhooks/webhook-secret';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import type {
  WebhookDeliveryRow,
  WebhookEndpointRow,
} from '@internal/webhooks/webhook.types';
import type {
  CreateWebhookDto,
  UpdateWebhookDto,
} from '@public/visualTest/notifications/presentation/dto/webhook.dto';

export interface WebhookEndpointView {
  id: string;
  url: string;
  events: string[];
  format: string;
  active: boolean;
  secretPreview: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEndpointWithSecret extends WebhookEndpointView {
  secret: string;
}

const DELIVERY_LIST_LIMIT = 50;

function secretPreview(secret: string): string {
  return `****${secret.slice(-4)}`;
}

function toView(endpoint: WebhookEndpointRow): WebhookEndpointView {
  return {
    id: endpoint.id,
    url: endpoint.url,
    events: endpoint.events,
    format: endpoint.format,
    active: endpoint.active,
    secretPreview: secretPreview(endpoint.secret),
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

@Injectable()
export class WebhookSettingsService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly endpoints: WebhookEndpointRepository,
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly dispatch: WebhookDispatchService,
    private readonly audit: AuditService,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  async list(projectName: string): Promise<WebhookEndpointView[]> {
    const project = await this.requireProject(projectName);
    const rows = await this.endpoints.findByProject(project.id);
    return rows.map(toView);
  }

  async create(
    projectName: string,
    dto: CreateWebhookDto,
    actor: string,
  ): Promise<WebhookEndpointWithSecret> {
    const project = await this.requireProject(projectName);
    assertSafeWebhookUrl(dto.url);
    const secret = dto.secret ?? generateWebhookSecret();
    // Endpoint and trail commit together: a webhook nobody can audit is a change
    // nobody owns.
    return this.uow.execute(async () => {
      const created = await this.endpoints.create({
        projectId: project.id,
        url: dto.url,
        secret,
        events: dto.events,
        format: dto.format ?? 'json',
      });
      await this.audit.record({
        actor: actor ?? null,
        action: AUDIT_ACTIONS.webhookCreate,
        projectName,
        targetType: 'webhook',
        targetId: created.id,
        metadata: {
          url: created.url,
          events: created.events,
          format: created.format,
        },
      });
      return { ...toView(created), secret: created.secret };
    });
  }

  async update(
    projectName: string,
    id: string,
    dto: UpdateWebhookDto,
    actor: string,
  ): Promise<WebhookEndpointView & { secret?: string }> {
    const project = await this.requireProject(projectName);
    const endpoint = await this.requireEndpoint(project.id, id);
    if (dto.url) assertSafeWebhookUrl(dto.url);
    return this.uow.execute(async () => {
      const updated = await this.endpoints.update(endpoint.id, {
        ...(dto.url ? { url: dto.url } : {}),
        ...(dto.events ? { events: dto.events } : {}),
        ...(dto.format ? { format: dto.format } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.secret ? { secret: dto.secret } : {}),
      });
      await this.audit.record({
        actor: actor ?? null,
        action: AUDIT_ACTIONS.webhookUpdate,
        projectName,
        targetType: 'webhook',
        targetId: updated.id,
        metadata: {
          url: updated.url,
          events: updated.events,
          format: updated.format,
          active: updated.active,
          secretRotated: Boolean(dto.secret),
        },
      });
      return {
        ...toView(updated),
        ...(dto.secret ? { secret: updated.secret } : {}),
      };
    });
  }

  async remove(projectName: string, id: string, actor: string): Promise<void> {
    const project = await this.requireProject(projectName);
    const endpoint = await this.requireEndpoint(project.id, id);
    await this.uow.execute(async () => {
      await this.endpoints.remove(endpoint.id);
      await this.audit.record({
        actor: actor ?? null,
        action: AUDIT_ACTIONS.webhookDelete,
        projectName,
        targetType: 'webhook',
        targetId: endpoint.id,
        metadata: { url: endpoint.url },
      });
    });
  }

  async listDeliveries(
    projectName: string,
    endpointId: string,
  ): Promise<WebhookDeliveryRow[]> {
    const project = await this.requireProject(projectName);
    const endpoint = await this.requireEndpoint(project.id, endpointId);
    return this.deliveries.listForEndpoint(endpoint.id, DELIVERY_LIST_LIMIT);
  }

  async replay(
    projectName: string,
    endpointId: string,
    deliveryId: string,
  ): Promise<void> {
    const project = await this.requireProject(projectName);
    const endpoint = await this.requireEndpoint(project.id, endpointId);
    const delivery = await this.deliveries.findByIdForEndpoint(
      endpoint.id,
      deliveryId,
    );
    if (!delivery) {
      throw new DomainError('Webhook delivery not found', 'NOT_FOUND');
    }
    await this.deliveries.replay(delivery.id);
  }

  async sendTest(projectName: string, endpointId: string): Promise<void> {
    const project = await this.requireProject(projectName);
    const endpoint = await this.requireEndpoint(project.id, endpointId);
    await this.dispatch.enqueueTestEvent({
      endpointId: endpoint.id,
      projectName: project.name,
    });
  }

  private async requireProject(projectName: string) {
    const project = await this.projects.requireByName(projectName);
    return project;
  }

  private async requireEndpoint(
    projectId: string,
    id: string,
  ): Promise<WebhookEndpointRow> {
    const endpoint = await this.endpoints.findByIdForProject(projectId, id);
    if (!endpoint) {
      throw new DomainError('Webhook endpoint not found', 'NOT_FOUND');
    }
    return endpoint;
  }
}
