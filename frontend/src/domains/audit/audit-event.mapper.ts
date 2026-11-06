import type { AuditEventDto, PaginatedAuditEventDto } from "@sdk";
import type {
  AuditAction,
  AuditEvent,
  AuditEventPage,
} from "./audit-event.model";

// Human labels for the actions the backend writes. Keys are the wire values;
// the filter select and the action badge both read this map.
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  approval: "Approval",
  "baseline.restore": "Baseline restored",
  "test.delete": "Test deleted",
  "variant.delete": "Variant deleted",
  "project.delete": "Project deleted",
  "branch.delete": "Branch deleted",
  "webhook.create": "Webhook created",
  "webhook.update": "Webhook updated",
  "webhook.delete": "Webhook deleted",
  "api-key.create": "API key created",
  "api-key.revoke": "API key revoked",
  "api-key.rotate": "API key rotated",
  "api-key.delete": "API key deleted",
  "review.assign": "Review assigned",
  "review.complete": "Review completed",
  "review.comment": "Review comment",
  "review.comment-resolve": "Review comment resolved",
  "project.pixel-threshold": "Project threshold changed",
  "test.threshold": "Threshold changed",
};

// The action column is a plain string in the schema, so a future value must
// render as itself instead of falling out of the table.
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action as AuditAction] ?? action;
}

function presentString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// The column is nullable JSON. Normalizing every "nothing here" spelling to
// null keeps the view's `?? "—"` honest instead of rendering "undefined" or a
// dropped cell.
function presentMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function mapAuditEvent(dto: AuditEventDto): AuditEvent {
  return {
    id: String(dto.id ?? ""),
    actor: presentString(dto.actor),
    action: dto.action ?? "",
    projectName: presentString(dto.projectName),
    testName: presentString(dto.testName),
    branchName: presentString(dto.branchName),
    targetType: presentString(dto.targetType),
    targetId: presentString(dto.targetId),
    metadata: presentMetadata(dto.metadata),
    createdAt: presentString(dto.createdAt) ?? "",
  };
}

// The endpoint answers newest first; mapping preserves that order.
export function mapAuditEvents(
  dtos: AuditEventDto[] | null | undefined,
): AuditEvent[] {
  return (dtos ?? []).map(mapAuditEvent);
}

export function mapAuditEventPage(
  dto: PaginatedAuditEventDto | undefined,
): AuditEventPage {
  return {
    items: mapAuditEvents(dto?.data),
    total: dto?.meta?.total ?? 0,
    page: dto?.meta?.page ?? 1,
    limit: dto?.meta?.limit ?? 0,
    totalPages: dto?.meta?.totalPages ?? 0,
  };
}

function metadataValueLabel(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map(metadataValueLabel)
      .filter((part) => part.length > 0)
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Compact "key value · key value" summary for the Details column. Nested values
// stay JSON so a structured field is still readable; absent values are dropped
// instead of rendering a dangling key.
export function describeAuditMetadata(
  metadata: Record<string, unknown> | null,
): string {
  if (!metadata) return "";
  return Object.entries(metadata)
    .map(([key, value]) => {
      const label = metadataValueLabel(value);
      return label ? `${key} ${label}` : "";
    })
    .filter((part) => part.length > 0)
    .join(" · ");
}

// The full payload behind the compact summary, used as the cell's title.
export function auditMetadataJson(
  metadata: Record<string, unknown> | null,
): string {
  return metadata ? JSON.stringify(metadata) : "";
}
