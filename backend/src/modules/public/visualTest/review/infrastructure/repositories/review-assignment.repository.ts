import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';

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
export class ReviewAssignmentRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  async create(input: CreateAssignmentInput) {
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
