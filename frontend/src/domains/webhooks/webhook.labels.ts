import { i18n } from "@/i18n";
import type { WebhookDeliveryStatus } from "./webhook.model";

// Display labels are locale-dependent, while the wire values stay untouched.
// Unknown events fall back to the raw name so a subscription added later still
// renders instead of disappearing.
const EVENT_KEY: Record<string, string> = {
  "review.requested": "webhookEvent.reviewRequested",
  "comparison.approved": "webhookEvent.comparisonApproved",
  "review.assigned": "webhookEvent.reviewAssigned",
  "review.comment": "webhookEvent.reviewComment",
  "job.failed": "webhookEvent.jobFailed",
};

const STATUS_KEY: Record<WebhookDeliveryStatus, string> = {
  PENDING: "webhookStatus.PENDING",
  PROCESSING: "webhookStatus.PROCESSING",
  DELIVERED: "webhookStatus.DELIVERED",
  FAILED: "webhookStatus.FAILED",
};

export function webhookEventLabelI18n(event: string): string {
  const key = EVENT_KEY[event];
  return key ? i18n.global.t(key) : event;
}

export function webhookStatusLabel(status: WebhookDeliveryStatus): string {
  return i18n.global.t(STATUS_KEY[status]);
}
