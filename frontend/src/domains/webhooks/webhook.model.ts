// The subscriptions an endpoint can select; kept in the backend's order
// (WEBHOOK_SUBSCRIPTION_EVENTS in webhook.types.ts) so the picker and the
// dispatch list cannot drift.
export const WEBHOOK_EVENTS = [
  "review.requested",
  "comparison.approved",
  "review.assigned",
  "review.comment",
  "job.failed",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
  "review.requested": "Review requested",
  "comparison.approved": "Comparison approved",
  "review.assigned": "Review assigned",
  "review.comment": "Review comment",
  "job.failed": "Comparison job failed",
};

// A subscription the API adds later still renders: the raw name is better than
// an empty badge. Takes a plain string because deliveries carry the event as a
// free-form DTO field (the synthetic `test` event is one of them).
export function webhookEventLabel(event: string): string {
  return WEBHOOK_EVENT_LABEL[event as WebhookEvent] ?? event;
}

export const WEBHOOK_FORMATS = ["json", "slack"] as const;

export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

export const WEBHOOK_FORMAT_LABEL: Record<WebhookFormat, string> = {
  json: "JSON",
  slack: "Slack",
};

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEvent[];
  format: WebhookFormat;
  active: boolean;
  secretPreview: string;
  createdAt: string;
  updatedAt: string;
}

export type WebhookDeliveryStatus =
  "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED";

export const WEBHOOK_DELIVERY_STATUS_LABEL: Record<
  WebhookDeliveryStatus,
  string
> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  DELIVERED: "Delivered",
  FAILED: "Failed",
};

// Mirrors WEBHOOK_MAX_ATTEMPTS in the delivery worker: the UI reports progress
// as "n/5" without asking the server for its retry budget.
export const WEBHOOK_MAX_ATTEMPTS = 5;

export interface WebhookDelivery {
  id: string;
  event: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface CreateWebhookInput {
  url: string;
  events: WebhookEvent[];
  format?: WebhookFormat;
  /** Omitted on create lets the server generate and reveal a secret. */
  secret?: string;
}

export interface UpdateWebhookInput {
  id: string;
  url?: string;
  events?: WebhookEvent[];
  format?: WebhookFormat;
  active?: boolean;
  /** Present rotates the signing secret; absent keeps the current one. */
  secret?: string;
}
