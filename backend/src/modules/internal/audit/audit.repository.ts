import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import type { Prisma } from '@/prisma/client';
import type {
  AuditEntry,
  AuditEventRow,
  AuditFilters,
} from '@internal/audit/audit.types';

// `projectId` is the resolved id of `filters.projectName` (undefined when no
// project filter was asked for, null when the name names no live project). A
// resolved id keeps a renamed project's trail reachable; the name fallback keeps
// the trail of a deleted project findable.
function whereFor(
  filters: AuditFilters,
  projectId?: string | null,
): Prisma.AuditEventWhereInput {
  return {
    ...(filters.actor ? { actor: filters.actor } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.projectName
      ? projectId
        ? { projectId }
        : { projectName: filters.projectName }
      : {}),
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
  // Policy-free on purpose: the two shapes are distinguished one level up in
  // AuditService (record asserts the ambient transaction, recordAccess is the
  // read-time log), so both share this single insert. The row joins whichever
  // transaction is active.
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

  // Batched variant of `create` for a mutation whose trail scales with its
  // input (a whole-project delete writes one row per test). One INSERT instead
  // of N round-trips keeps that inside the deletion transaction's budget.
  async createMany(entries: readonly AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.client.auditEvent.createMany({
      data: entries.map((entry) => ({
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
      })),
    });
  }

  async findPage(
    filters: AuditFilters,
    skip: number,
    take: number,
  ): Promise<{ data: AuditEventRow[]; total: number }> {
    return findManyWithCount<AuditEventRow>(this.client.auditEvent, {
      where: whereFor(filters, await this.resolveProjectId(filters)),
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
      where: whereFor(filters, await this.resolveProjectId(filters)),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  private async resolveProjectId(
    filters: AuditFilters,
  ): Promise<string | null | undefined> {
    if (!filters.projectName) return undefined;
    const project = await this.client.project.findUnique({
      where: { name: filters.projectName },
      select: { id: true },
    });
    return project?.id ?? null;
  }
}
