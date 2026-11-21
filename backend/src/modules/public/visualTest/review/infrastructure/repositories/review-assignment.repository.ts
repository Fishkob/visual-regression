import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type { ProjectScope } from '@common/domain/project-scope';

export interface CreateAssignmentInput {
  projectId: string;
  branchName: string | null;
  testId: string | null;
  runId: string | null;
  assigneeId: string;
  assigneeUsername: string;
  assignedBy: string;
  dueAt: Date | null;
}

function projectIdWhere(scope: ProjectScope): { projectId?: { in: string[] } } {
  return scope.kind === 'all' ? {} : { projectId: { in: [...scope.ids] } };
}

@Injectable()
export class ReviewAssignmentRepository extends BaseRepository {
  // Transaction-aware: an assignment always changes together with its outbox
  // row and its audit row (ReviewAssignmentService owns that transaction), so
  // the write has to join it instead of riding the bare connection.
  async create(input: CreateAssignmentInput) {
    this.assertWritable();
    return this.client.reviewAssignment.create({
      data: input,
      include: {
        test: { select: { name: true, kind: true } },
        run: { select: { key: true } },
        project: { select: { name: true } },
      },
    });
  }

  // Scoped (ADR-082): an assignment is a work item on a project, so a reviewer
  // only sees the items of projects it can open. `projectIds === null` means
  // "unrestricted", which is what a system reader passes.
  async listForAssignee(
    assigneeId: string,
    includeCompleted: boolean,
    scope: ProjectScope,
  ) {
    return this.client.reviewAssignment.findMany({
      where: {
        assigneeId,
        ...(includeCompleted ? {} : { completedAt: null }),
        ...projectIdWhere(scope),
      },
      include: {
        test: { select: { name: true, kind: true } },
        run: { select: { key: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async listForProject(projectId: string) {
    return this.client.reviewAssignment.findMany({
      where: { projectId },
      include: {
        test: { select: { name: true, kind: true } },
        run: { select: { key: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async complete(id: string, assigneeId: string): Promise<boolean> {
    this.assertWritable();
    const result = await this.client.reviewAssignment.updateMany({
      where: { id, assigneeId, completedAt: null },
      data: { completedAt: new Date() },
    });
    return result.count > 0;
  }

  async findById(id: string) {
    return this.client.reviewAssignment.findUnique({
      where: { id },
      include: {
        test: { select: { name: true, kind: true } },
        run: { select: { key: true } },
        project: { select: { name: true } },
      },
    });
  }

  async overdue(assigneeId: string, now: Date, scope: ProjectScope) {
    return this.client.reviewAssignment.findMany({
      where: {
        assigneeId,
        completedAt: null,
        dueAt: { lt: now },
        ...projectIdWhere(scope),
      },
      include: {
        test: { select: { name: true, kind: true } },
        run: { select: { key: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ dueAt: 'asc' }],
    });
  }
}
