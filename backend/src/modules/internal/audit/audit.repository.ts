import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import type { Prisma } from '@/prisma/client';
import type {
  AuditEntry,
  AuditEventRow,
  AuditFilters,
} from '@internal/audit/audit.types';

function whereFor(filters: AuditFilters): Prisma.AuditEventWhereInput {
  return {
    ...(filters.actor ? { actor: filters.actor } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.projectName ? { projectName: filters.projectName } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

@Injectable()
export class AuditRepository extends BaseRepository {
  // Deliberately no assertWritable: settings writes are standalone and the
  // transactional callers already run inside a StateChangeWorkflow. The audit
  // row joins whichever transaction is active.
  async create(entry: AuditEntry): Promise<void> {
    await this.client.auditEvent.create({
      data: {
        actor: entry.actor ?? null,
        action: entry.action,
        projectName: entry.projectName ?? null,
        testName: entry.testName ?? null,
        branchName: entry.branchName ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ...(entry.metadata
          ? { metadata: entry.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async findPage(
    filters: AuditFilters,
    skip: number,
    take: number,
  ): Promise<{ data: AuditEventRow[]; total: number }> {
    return findManyWithCount<AuditEventRow>(this.client.auditEvent, {
      where: whereFor(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
  }

  // CSV export is a bounded snapshot, not a second pagination surface: the
  // caller gets the newest matching rows up to `take`.
  async findForExport(
    filters: AuditFilters,
    take: number,
  ): Promise<AuditEventRow[]> {
    return this.client.auditEvent.findMany({
      where: whereFor(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }
}
