import { Injectable } from '@nestjs/common';
import { TransactionContext } from '@/prisma/transaction-context';
import { AuditRepository } from '@internal/audit/audit.repository';
import type {
  AuditEntry,
  AuditEventRow,
  AuditFilters,
} from '@internal/audit/audit.types';

const EXPORT_LIMIT = 10_000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
  } else if (value instanceof Date) {
    text = value.toISOString();
  } else {
    text = JSON.stringify(value);
  }
  return `"${text.replace(/"/g, '""')}"`;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly events: AuditRepository,
    private readonly txCtx: TransactionContext,
  ) {}

  // A mutation's trail: the row commits or rolls back with the change it
  // records. Asserted, not documented — the same guarantee
  // WebhookDeliveryRepository.createMany gives the outbox. A write path that
  // forgot its transaction fails here instead of leaving a trail that outlived
  // (or preceded) the change it names.
  async record(entry: AuditEntry): Promise<void> {
    this.txCtx.assertInTransaction();
    await this.events.create(entry);
  }

  // Same transaction contract as `record`, one INSERT for the whole set.
  async recordMany(entries: readonly AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    this.txCtx.assertInTransaction();
    await this.events.createMany(entries);
  }

  // A read's access log: there is no domain change to ride, so it writes on its
  // own connection. The one caller is opening a share link, which must not fail
  // because no transaction happens to be open.
  async recordAccess(entry: AuditEntry): Promise<void> {
    await this.events.create(entry);
  }

  async list(
    filters: AuditFilters,
    skip: number,
    take: number,
  ): Promise<{ data: AuditEventRow[]; total: number }> {
    return this.events.findPage(filters, skip, take);
  }

  async exportCsv(filters: AuditFilters): Promise<string> {
    const rows = await this.events.findForExport(filters, EXPORT_LIMIT);
    const header = [
      'createdAt',
      'actor',
      'action',
      'projectName',
      'testName',
      'branchName',
      'targetType',
      'targetId',
      'metadata',
    ].join(',');
    const lines = rows.map((row) =>
      [
        row.createdAt.toISOString(),
        row.actor,
        row.action,
        row.projectName,
        row.testName,
        row.branchName,
        row.targetType,
        row.targetId,
        row.metadata,
      ]
        .map(csvCell)
        .join(','),
    );
    return [header, ...lines].join('\n');
  }
}
