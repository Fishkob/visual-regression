import type { WebhooksControllerListResponses } from "@sdk/models/WebhooksControllerListResponses.gen";

export const WEBHOOKS_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "wh-1",
      url: "https://hooks.slack.com/services/T000/B000/checkout",
      events: ["review.requested", "comparison.approved"],
      format: "slack",
      active: true,
      secretPreview: "****7f3a",
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-20T10:00:00.000Z",
    },
    {
      id: "wh-2",
      url: "https://example.com/vrt-disabled",
      events: ["review.comment"],
      format: "json",
      active: false,
      secretPreview: "****ab12",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
    },
  ] satisfies WebhooksControllerListResponses[200]),
};
