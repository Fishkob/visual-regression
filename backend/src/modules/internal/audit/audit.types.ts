import type { Prisma } from '@/prisma/client';

// Known actions are constants so writers and the read filter cannot drift on
// spelling. The column is a plain string: a future action does not need a
// migration.
export const AUDIT_ACTIONS = {
  approval: 'approval',
  baselineRestore: 'baseline.restore',
  testDelete: 'test.delete',
  projectDelete: 'project.delete',
  branchDelete: 'branch.delete',
  webhookCreate: 'webhook.create',
  webhookUpdate: 'webhook.update',
  webhookDelete: 'webhook.delete',
  apiKeyCreate: 'api-key.create',
  apiKeyRevoke: 'api-key.revoke',
  apiKeyRotate: 'api-key.rotate',
  apiKeyDelete: 'api-key.delete',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  actor?: string | null;
  action: string;
  projectName?: string | null;
  testName?: string | null;
  branchName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEventRow {
  id: string;
  actor: string | null;
  action: string;
  projectName: string | null;
  testName: string | null;
  branchName: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface AuditFilters {
  actor?: string;
  action?: string;
  projectName?: string;
  from?: Date;
  to?: Date;
}
