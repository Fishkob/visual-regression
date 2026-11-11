import type { WebhookDeliveryDto, WebhookEndpointDto } from "@sdk";
import type {
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEvent,
  WebhookFormat,
} from "./webhook.model";

// The generated DTO types the nullable delivery columns as free-form objects:
// the backend declares them nullable but untyped, so the OpenAPI spec gives the
// client `{ [key: string]: unknown } | null` where the wire carries
// `number | null`, `string | null` and `Date | null`. The source keeps the
// generated fields but widens those four to `unknown`, so the mapper accepts the
// SDK type as-is and normalizes every spelling to one absent value.
export type WebhookDeliverySource = Omit<
  WebhookDeliveryDto,
  "responseStatus" | "lastError" | "nextAttemptAt" | "deliveredAt"
> & {
  responseStatus?: unknown;
  lastError?: unknown;
  nextAttemptAt?: unknown;
  deliveredAt?: unknown;
};

function presentNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function presentString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// The wire carries ISO strings; a `Date` is accepted too because the backend
// DTO declares these columns as dates and a direct (non-JSON) call would hand
// one over.
function presentIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return presentString(value);
}

function presentStatus(value: string | undefined): WebhookDeliveryStatus {
  return value === "PROCESSING" || value === "DELIVERED" || value === "FAILED"
    ? value
    : "PENDING";
}

function presentFormat(value: string | undefined): WebhookFormat {
  return value === "slack" ? "slack" : "json";
}

export function mapWebhookEndpoint(dto: WebhookEndpointDto): WebhookEndpoint {
  return {
    id: String(dto.id ?? ""),
    url: dto.url ?? "",
    // The generated DTO types events as string[]; the frontend knows the
    // subscriptions the API accepts today, and webhookEventLabel falls back to
    // the raw name so an event added later still renders instead of disappearing.
    events: (dto.events ?? []) as WebhookEvent[],
    format: presentFormat(dto.format),
    active: dto.active ?? false,
    secretPreview: dto.secretPreview ?? "",
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}

export function mapWebhookEndpoints(
  dtos: WebhookEndpointDto[] | undefined = [],
): WebhookEndpoint[] {
  return dtos.map(mapWebhookEndpoint);
}

// A create answer always carries the secret, and an update that rotates one
// answers with the created shape while the generated client only declares the
// plain endpoint — so the secret is read at runtime instead of trusted from the
// response type.
export function webhookSecretOf(dto: WebhookEndpointDto): string | null {
  const secret = (dto as { secret?: unknown }).secret;
  return typeof secret === "string" && secret.length > 0 ? secret : null;
}

export function mapWebhookDelivery(
  dto: WebhookDeliverySource,
): WebhookDelivery {
  return {
    id: String(dto.id ?? ""),
    event: dto.event ?? "",
    status: presentStatus(dto.status),
    attempts: dto.attempts ?? 0,
    responseStatus: presentNumber(dto.responseStatus),
    lastError: presentString(dto.lastError),
    nextAttemptAt: presentIso(dto.nextAttemptAt),
    createdAt: dto.createdAt ?? "",
    deliveredAt: presentIso(dto.deliveredAt),
  };
}

// The list endpoint already answers newest first; sorting here keeps the
// "newest first" contract even if a delivery row is written mid-read.
export function mapWebhookDeliveries(
  dtos: WebhookDeliverySource[] | null | undefined,
): WebhookDelivery[] {
  return (dtos ?? [])
    .map(mapWebhookDelivery)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
