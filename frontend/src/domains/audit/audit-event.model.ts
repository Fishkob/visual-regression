// The action values the backend records. Kept as a list (not only a type) so
// the filter select can offer every known action; an action added later still
// renders through auditActionLabel instead of disappearing.
export const AUDIT_ACTIONS = [
  "approval",
  "baseline.restore",
  "test.delete",
  "variant.delete",
  "project.delete",
  "branch.delete",
  "webhook.create",
  "webhook.update",
  "webhook.delete",
  "api-key.create",
  "api-key.revoke",
  "api-key.rotate",
  "api-key.delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// One recorded change. The nullable members are denormalized names/ids the
// backend keeps after the entity is gone, so a null reads "unknown/removed"
// rather than "not loaded".
export interface AuditEvent {
  id: string;
  actor: string | null;
  action: string;
  projectName: string | null;
  testName: string | null;
  branchName: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// One page of the trail plus the server's pagination meta: the view binds
// PaginationBar to this instead of re-deriving the page count from a total.
export interface AuditEventPage {
  items: AuditEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Server-side filters. The view only sends the members the operator filled in.
export interface AuditFilters {
  actor?: string;
  action?: AuditAction;
  projectName?: string;
  from?: string;
  to?: string;
}

export interface AuditEventsQuery extends AuditFilters {
  page?: number;
  limit?: number;
}
