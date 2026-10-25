import { describe, expect, it } from "vitest";
import { webhookEventLabelI18n } from "../webhook.labels";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABEL,
  webhookEventLabel,
} from "../webhook.model";

// Mirrors WEBHOOK_SUBSCRIPTION_EVENTS in
// backend/src/modules/internal/webhooks/webhook.types.ts. Copied instead of
// imported so the frontend type check never pulls backend sources into its
// program; the parity assertion below is what catches drift in either
// direction.
const BACKEND_SUBSCRIPTION_EVENTS = [
  "review.requested",
  "comparison.approved",
  "review.assigned",
  "review.comment",
] as const;

describe("webhook event parity with the backend", () => {
  it("offers exactly the subscriptions the backend dispatches", () => {
    expect([...WEBHOOK_EVENTS]).toEqual([...BACKEND_SUBSCRIPTION_EVENTS]);
  });

  it("labels every subscription in both label maps", () => {
    for (const event of BACKEND_SUBSCRIPTION_EVENTS) {
      expect(WEBHOOK_EVENT_LABEL[event]).toBeTruthy();
      expect(webhookEventLabel(event)).toBe(WEBHOOK_EVENT_LABEL[event]);
      expect(webhookEventLabelI18n(event)).not.toBe(event);
    }
  });

  it("renders a delivery whose event the frontend does not know yet", () => {
    // Older deliveries and the synthetic `test` event stay readable: the raw
    // wire value is the fallback instead of an empty badge.
    expect(webhookEventLabelI18n("job.failed")).toBe("job.failed");
    expect(webhookEventLabelI18n("test")).toBe("test");
    expect(webhookEventLabel("review.comment")).toBe("Review comment");
  });
});
