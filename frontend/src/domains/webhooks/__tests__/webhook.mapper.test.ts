import { describe, expect, it } from "vitest";
import type { WebhookEndpointDto } from "@sdk";
import {
  mapWebhookDeliveries,
  mapWebhookDelivery,
  mapWebhookEndpoint,
  mapWebhookEndpoints,
  webhookSecretOf,
  type WebhookDeliverySource,
} from "../webhook.mapper";
import { webhookEventLabel } from "../webhook.model";

const endpointDto = (
  overrides: Partial<WebhookEndpointDto> = {},
): WebhookEndpointDto => ({
  id: "wh-1",
  url: "https://hooks.example.com/vrt",
  events: ["review.requested", "comparison.approved"],
  format: "json",
  active: true,
  secretPreview: "****abcd",
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-21T10:00:00.000Z",
  ...overrides,
});

const deliveryDto = (
  overrides: Partial<WebhookDeliverySource> = {},
): WebhookDeliverySource => ({
  id: "d-1",
  event: "review.requested",
  status: "PENDING",
  attempts: 1,
  responseStatus: null,
  lastError: null,
  nextAttemptAt: null,
  createdAt: "2026-10-20T10:00:00.000Z",
  deliveredAt: null,
  ...overrides,
});

describe("webhook mapper", () => {
  it("maps an endpoint DTO", () => {
    expect(mapWebhookEndpoint(endpointDto())).toEqual({
      id: "wh-1",
      url: "https://hooks.example.com/vrt",
      events: ["review.requested", "comparison.approved"],
      format: "json",
      active: true,
      secretPreview: "****abcd",
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-21T10:00:00.000Z",
    });
  });

  it("tolerates an endpoint without events and defaults its format", () => {
    const mapped = mapWebhookEndpoint(
      endpointDto({
        events: undefined as unknown as string[],
        format: undefined as unknown as "json",
        active: undefined as unknown as boolean,
        secretPreview: undefined as unknown as string,
      }),
    );

    expect(mapped.events).toEqual([]);
    expect(mapped.format).toBe("json");
    expect(mapped.active).toBe(false);
    expect(mapped.secretPreview).toBe("");
  });

  it("maps an undefined endpoint list to an empty list", () => {
    expect(mapWebhookEndpoints(undefined)).toEqual([]);
  });

  it("reads the one-time secret only when the answer carries one", () => {
    expect(webhookSecretOf(endpointDto())).toBeNull();
    expect(
      webhookSecretOf(
        endpointDto({
          secret: "generated-secret",
        } as Partial<WebhookEndpointDto>),
      ),
    ).toBe("generated-secret");
  });

  it("maps a failed delivery with its last error and response status", () => {
    expect(
      mapWebhookDelivery(
        deliveryDto({
          status: "FAILED",
          attempts: 5,
          responseStatus: 503,
          lastError: "connection refused",
          deliveredAt: "2026-10-20T10:05:00.000Z",
        }),
      ),
    ).toEqual({
      id: "d-1",
      event: "review.requested",
      status: "FAILED",
      attempts: 5,
      responseStatus: 503,
      lastError: "connection refused",
      nextAttemptAt: null,
      createdAt: "2026-10-20T10:00:00.000Z",
      deliveredAt: "2026-10-20T10:05:00.000Z",
    });
  });

  it("normalizes the nullable delivery columns", () => {
    const mapped = mapWebhookDelivery(
      deliveryDto({
        responseStatus: undefined as unknown as null,
        lastError: undefined as unknown as null,
        nextAttemptAt: new Date("2026-10-20T10:01:00.000Z"),
        deliveredAt: "",
        attempts: undefined as unknown as number,
      }),
    );

    expect(mapped.responseStatus).toBeNull();
    expect(mapped.lastError).toBeNull();
    expect(mapped.nextAttemptAt).toBe("2026-10-20T10:01:00.000Z");
    expect(mapped.deliveredAt).toBeNull();
    expect(mapped.attempts).toBe(0);
  });

  it("sorts deliveries newest first and maps a missing list to empty", () => {
    const rows = mapWebhookDeliveries([
      deliveryDto({ id: "older", createdAt: "2026-10-19T10:00:00.000Z" }),
      deliveryDto({ id: "newest", createdAt: "2026-10-21T10:00:00.000Z" }),
      deliveryDto({ id: "middle", createdAt: "2026-10-20T10:00:00.000Z" }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["newest", "middle", "older"]);
    expect(mapWebhookDeliveries(undefined)).toEqual([]);
    expect(mapWebhookDeliveries(null)).toEqual([]);
  });

  it("labels the known events and falls back to the raw name", () => {
    expect(webhookEventLabel("review.requested")).toBe("Review requested");
    expect(webhookEventLabel("comparison.approved")).toBe(
      "Comparison approved",
    );
    expect(webhookEventLabel("review.assigned")).toBe("Review assigned");
    expect(webhookEventLabel("review.comment")).toBe("Review comment");
    expect(webhookEventLabel("job.failed")).toBe("Comparison job failed");
    expect(webhookEventLabel("run.finished")).toBe("run.finished");
    // The synthetic test delivery is not a subscription; it still renders.
    expect(webhookEventLabel("test")).toBe("test");
  });
});
