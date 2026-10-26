import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import { AuthRepository } from '@internal/auth/auth.repository';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { ReviewAssignmentRepository } from '@public/visualTest/review/infrastructure/repositories/review-assignment.repository';

export interface AssignmentView {
  id: string;
  projectName: string;
  branchName: string | null;
  testName: string | null;
  testKind: string | null;
  runKey: string | null;
  assigneeUsername: string;
  assignedBy: string;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  isOverdue: boolean;
}

@Injectable()
export class ReviewAssignmentService {
  constructor(
    private readonly assignments: ReviewAssignmentRepository,
    private readonly projects: ProjectRepository,
    private readonly branches: BranchResolver,
    private readonly tests: UnifiedTestRepository,
    private readonly runs: RunRepository,
    private readonly users: AuthRepository,
    private readonly webhooks: WebhookDispatchService,
    private readonly audit: AuditService,
  ) {}

  async create(
    projectName: string,
    input: {
      testName?: string;
      runKey?: string;
      branch?: string;
      assignee: string;
      dueAt?: string;
    },
    actor: string,
  ): Promise<AssignmentView> {
    const project = await this.projects.requireByName(projectName);
    const assignee = await this.users.findUserByUsername(input.assignee);
    if (!assignee) {
      throw new DomainError(`User "${input.assignee}" not found`, 'NOT_FOUND');
    }
    if (!assignee.isActive) {
      throw new DomainError(`User "${input.assignee}" not found`, 'NOT_FOUND');
    }
    if (!input.testName && !input.runKey) {
      throw new DomainError(
        'A testName or runKey is required for an assignment',
        'BAD_REQUEST',
      );
    }
    const branch = await this.branches.resolveRead(projectName, input.branch);
    let testId: string | null = null;
    let testName: string | null;
    let kind: string | null = null;
    let runId: string | null = null;
    if (input.runKey) {
      const run = await this.runs.findByBranchKey(
        branch.branchId,
        input.runKey,
      );
      if (!run) throw new DomainError('Run not found', 'NOT_FOUND');
      runId = run.id;
      testName = input.testName ?? null;
      if (input.testName) {
        const test = await this.tests.findByBranchAndTestName(
          branch.branchId,
          input.testName,
        );
        if (!test) throw new DomainError('Test not found', 'NOT_FOUND');
        testId = test.id;
        kind = test.kind;
      }
    } else {
      const test = await this.tests.findByBranchAndTestName(
        branch.branchId,
        input.testName ?? '',
      );
      if (!test) throw new DomainError('Test not found', 'NOT_FOUND');
      testId = test.id;
      testName = test.name;
      kind = test.kind;
    }
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      throw new DomainError('dueAt must be a valid date', 'BAD_REQUEST');
    }
    const row = await this.assignments.create({
      projectId: project.id,
      branchName: branch.branchName,
      testId,
      runId,
      assigneeId: assignee.id,
      assigneeUsername: assignee.username,
      assignedBy: actor,
      dueAt,
    });
    if (testName && kind) {
      await this.webhooks.enqueueReviewAssigned({
        projectName,
        testName,
        branchName: branch.branchName,
        kind,
        assignee: assignee.username,
        dueAt: dueAt?.toISOString() ?? null,
      });
    }
    await this.audit.record({
      actor,
      action: AUDIT_ACTIONS.reviewAssign,
      projectName,
      testName,
      branchName: branch.branchName,
      targetType: 'assignment',
      targetId: row.id,
      metadata: {
        assignee: assignee.username,
        dueAt: dueAt?.toISOString() ?? null,
        runKey: input.runKey ?? null,
      },
    });
    return this.toView(row);
  }

  async mine(
    assigneeId: string,
    includeCompleted = false,
  ): Promise<AssignmentView[]> {
    return (
      await this.assignments.listForAssignee(assigneeId, includeCompleted)
    ).map((row) => this.toView(row));
  }

  async overdue(assigneeId: string): Promise<AssignmentView[]> {
    return (await this.assignments.overdue(assigneeId, new Date())).map((row) =>
      this.toView(row),
    );
  }

  async complete(
    assigneeId: string,
    id: string,
    actor: string,
  ): Promise<AssignmentView> {
    const isCompleted = await this.assignments.complete(id, assigneeId);
    if (!isCompleted) {
      throw new DomainError(
        'Assignment not found or already complete',
        'NOT_FOUND',
      );
    }
    const row = await this.assignments.findById(id);
    if (!row) throw new DomainError('Assignment not found', 'NOT_FOUND');
    await this.audit.record({
      actor,
      action: AUDIT_ACTIONS.reviewComplete,
      projectName: row.project.name,
      testName: row.test?.name ?? null,
      branchName: row.branchName,
      targetType: 'assignment',
      targetId: id,
    });
    return this.toView(row);
  }

  private toView(row: {
    id: string;
    branchName: string | null;
    assigneeUsername: string;
    assignedBy: string;
    dueAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    project: { name: string };
    test: { name: string; kind: string } | null;
    run: { key: string } | null;
  }): AssignmentView {
    return {
      id: row.id,
      projectName: row.project.name,
      branchName: row.branchName,
      testName: row.test?.name ?? null,
      testKind: row.test?.kind ?? null,
      runKey: row.run?.key ?? null,
      assigneeUsername: row.assigneeUsername,
      assignedBy: row.assignedBy,
      dueAt: row.dueAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      isOverdue:
        row.completedAt === null &&
        row.dueAt !== null &&
        row.dueAt.getTime() < Date.now(),
    };
  }
}
