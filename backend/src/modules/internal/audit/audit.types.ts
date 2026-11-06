import type { Prisma } from '@/prisma/client';

// Known actions are constants so writers and the read filter cannot drift on
// spelling. The column is a plain string: a future action does not need a
// migration.
export const AUDIT_ACTIONS = {
  approval: 'approval',
  baselineRestore: 'baseline.restore',
  testDelete: 'test.delete',
  variantDelete: 'variant.delete',
  projectDelete: 'project.delete',
  projectRename: 'project.rename',
  testUpdate: 'test.update',
  branchDelete: 'branch.delete',
  webhookCreate: 'webhook.create',
  webhookUpdate: 'webhook.update',
  webhookDelete: 'webhook.delete',
  apiKeyCreate: 'api-key.create',
  apiKeyRevoke: 'api-key.revoke',
  apiKeyRotate: 'api-key.rotate',
  apiKeyDelete: 'api-key.delete',
  userCreate: 'user.create',
  userUpdate: 'user.update',
  userResetPassword: 'user.reset-password',
  shareCreate: 'share.create',
  shareRevoke: 'share.revoke',
  shareAccess: 'share.access',
  reviewAssign: 'review.assign',
  projectPixelThreshold: 'project.pixel-threshold',
  storageRetention: 'storage.retention',
  testThreshold: 'test.threshold',
  reviewComplete: 'review.complete',
  reviewComment: 'review.comment',
  reviewCommentResolve: 'review.comment-resolve',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  actor?: string | null;
  // The union, not `string`: a misspelled action used to compile and then
  // disappear from the read filter, which is exactly the drift AUDIT_ACTIONS
  // exists to prevent. The *filter* stays a plain string on purpose — it arrives
  // from a query parameter.
  action: AuditAction;
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
