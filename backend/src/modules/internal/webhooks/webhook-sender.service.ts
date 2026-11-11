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
// The receiver's error body is only stored as a 200-char hint for the admin
// UI, so there is no reason to buffer an unbounded response: a slow or hostile
// endpoint could otherwise push hundreds of MB into the worker's heap for one
// delivery attempt.
const MAX_ERROR_BODY_BYTES = 4096;
const ERROR_BODY_HINT_CHARS = 200;

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
        // A followed redirect would route around the SSRF guard, which only
        // vets the configured URL: a 302 to http://169.254.169.254/ would land
        // internally. Treat every 3xx as a failed delivery instead.
        redirect: 'manual',
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      if (response.ok) {
        return { ok: true, status: response.status };
      }

      const text = await readCappedText(response, MAX_ERROR_BODY_BYTES);
      const suffix = text ? `: ${text.slice(0, ERROR_BODY_HINT_CHARS)}` : '';
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
    // A run-scoped event is more useful as a link into the run than into the
    // test; every other event keeps the review link it has always carried.
    const link = payload.links.run ?? payload.links.review;
    return `[Visual regression] ${subject} ${this.slackAction(payload)} — ${link}`;
  }

  // One sentence per event, plus the context that event carries.
  private slackAction(payload: WebhookPayload): string {
    switch (payload.event) {
      case 'review.requested':
        return 'needs review';
      case 'comparison.approved':
        return `was approved${this.approvalDetail(payload)}`;
      case 'review.assigned':
        return `was assigned to ${String(payload.assignee)}`;
      case 'review.comment':
        return `received a comment from ${String(payload.comment?.author)}`;
      case 'job.failed':
        return `failed to compare${payload.job ? ` (${payload.job.error})` : ''}`;
      default:
        return 'test delivery';
    }
  }

  // The approval's optional decision context, rendered as a compact suffix.
  // Both fields are reviewer-supplied; the note is already capped at the DTO
  // boundary.
  private approvalDetail(payload: WebhookPayload): string {
    const reason = payload.reason ? ` [${payload.reason}]` : '';
    const note = payload.note ? ` — ${payload.note}` : '';
    return `${reason}${note}`;
  }
}

// Reads at most `cap` bytes of a response body and cancels the rest. Only used
// for the error hint, so completeness beyond the cap is never needed.
async function readCappedText(
  response: Response,
  cap: number,
): Promise<string> {
  const stream = response.body;
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < cap) {
      const { done: isDone, value } = await reader.read();
      if (isDone) break;
      const chunk = value.subarray(0, cap - total);
      chunks.push(chunk);
      total += chunk.length;
      if (chunk.length < value.length) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString('utf8');
}
