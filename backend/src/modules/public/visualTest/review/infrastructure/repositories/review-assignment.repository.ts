import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';

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

  async listForAssignee(assigneeId: string, includeCompleted = false) {
    return this.client.reviewAssignment.findMany({
      where: {
        assigneeId,
        ...(includeCompleted ? {} : { completedAt: null }),
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

  async overdue(assigneeId: string, now: Date) {
    return this.client.reviewAssignment.findMany({
      where: {
        assigneeId,
        completedAt: null,
        dueAt: { lt: now },
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
