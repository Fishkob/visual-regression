import { Injectable } from '@nestjs/common';
import { signWebhookDelivery } from '@internal/webhooks/webhook-signature';
import type {
  WebhookDeliveryRow,
  WebhookEndpointRow,
  WebhookPayload,
} from '@internal/webhooks/webhook.types';

export interface WebhookSendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const DELIVERY_TIMEOUT_MS = 10_000;

// One HTTP delivery attempt. Formatting (json vs Slack) and signing live here;
// retry/backoff lives in the dispatcher. The consumer verifies the signature
// over `${timestamp}.${rawBody}`, so the body string is built before signing and
// sent unchanged.
@Injectable()
export class WebhookSender {
  async send(
    endpoint: WebhookEndpointRow,
    delivery: WebhookDeliveryRow,
  ): Promise<WebhookSendResult> {
    const payload = delivery.payload as WebhookPayload;
    const body = this.bodyFor(endpoint, payload);
    const timestamp = Math.floor(Date.now() / 1000);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'visual-regression-webhook/1',
          'x-vrt-event': delivery.event,
          'x-vrt-delivery-id': delivery.id,
          'x-vrt-timestamp': String(timestamp),
          'x-vrt-signature': signWebhookDelivery(
            endpoint.secret,
            timestamp,
            body,
          ),
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      if (response.ok) {
        return { ok: true, status: response.status };
      }

      const text = await response.text().catch(() => '');
      const suffix = text ? `: ${text.slice(0, 200)}` : '';
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${String(response.status)}${suffix}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private bodyFor(
    endpoint: WebhookEndpointRow,
    payload: WebhookPayload,
  ): string {
    if (endpoint.format === 'slack') {
      return JSON.stringify({ text: this.slackText(payload) });
    }
    return JSON.stringify(payload);
  }

  private slackText(payload: WebhookPayload): string {
    const subject = payload.test
      ? `${payload.project.name} / ${payload.test.name}`
      : payload.project.name;
    const action =
      payload.event === 'review.requested'
        ? 'needs review'
        : payload.event === 'comparison.approved'
          ? 'was approved'
          : 'test delivery';
    return `[Visual regression] ${subject} ${action} — ${payload.links.review}`;
  }
}
