import { Injectable } from '@nestjs/common';
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
  constructor(private readonly events: AuditRepository) {}

  // Transaction-riding when the caller is inside a StateChangeWorkflow: the
  // audit row commits or rolls back with the mutation it records.
  async record(entry: AuditEntry): Promise<void> {
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
