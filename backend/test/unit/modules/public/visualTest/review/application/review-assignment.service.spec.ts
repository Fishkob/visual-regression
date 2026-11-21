import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import type { Prisma } from '@/prisma/client';
import { DomainError } from '@common/domain/domain-error';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import {
  AuthRepository,
  type AuthUserRow,
} from '@internal/auth/auth.repository';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import type { RunWithBranch } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { ReviewAssignmentService } from '@public/visualTest/review/application/review-assignment.service';
import { ALL_PROJECTS } from '@common/domain/project-scope';
import { ReviewAssignmentRepository } from '@public/visualTest/review/infrastructure/repositories/review-assignment.repository';
import { createMock } from '@test/utils/create-mock';
import { createMockProjectRepository, createMockUoW } from '@test/utils/mocks';

type AssignmentRow = Prisma.ReviewAssignmentGetPayload<{
  include: {
    test: { select: { name: true; kind: true } };
    run: { select: { key: true } };
    project: { select: { name: true } };
  };
}>;

describe('ReviewAssignmentService', () => {
  let service: ReviewAssignmentService;
  let assignments: Mocked<ReviewAssignmentRepository>;
  let projects: Mocked<ProjectRepository>;
  let branches: Mocked<BranchResolver>;
  let tests: Mocked<UnifiedTestRepository>;
  let runs: Mocked<RunRepository>;
  let users: Mocked<AuthRepository>;
  let webhooks: Mocked<WebhookDispatchService>;
  let audit: Mocked<AuditService>;
  let uow: Mocked<PrismaUnitOfWork>;

  const project = {
    id: 'project-1',
    name: 'shop',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };
  const defaultBranch = {
    projectId: 'project-1',
    branchId: 'branch-1',
    branchName: 'main',
    isDefault: true,
    isArchived: false,
  };
  const featureBranch = {
    projectId: 'project-1',
    branchId: 'branch-2',
    branchName: 'feature/x',
    isDefault: false,
    isArchived: false,
  };
  const createdAt = new Date('2024-05-01T10:00:00.000Z');

  function makeUser(overrides: Partial<AuthUserRow> = {}): AuthUserRow {
    return {
      id: 'user-1',
      username: 'alice',
      passwordHash: 'hash',
      role: 'MEMBER',
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function makeRun(overrides: Partial<RunWithBranch> = {}): RunWithBranch {
    return {
      id: 'run-1',
      projectId: 'project-1',
      branchId: 'branch-1',
      key: 'run-42',
      commitSha: null,
      commitMessage: null,
      ciUrl: null,
      metadata: null,
      createdAt,
      lastActivityAt: createdAt,
      finishedAt: null,
      finishedBy: null,
      branch: { name: 'main' },
      ...overrides,
    };
  }

  function makeAssignment(
    overrides: Partial<AssignmentRow> = {},
  ): AssignmentRow {
    return {
      id: 'assignment-1',
      projectId: 'project-1',
      project: { name: 'shop' },
      branchName: 'main',
      testId: 'test-1',
      test: { name: 'login', kind: 'image' },
      runId: null,
      run: null,
      assigneeId: 'user-1',
      assigneeUsername: 'alice',
      assignedBy: 'admin',
      dueAt: null,
      completedAt: null,
      createdAt,
      ...overrides,
    };
  }

  beforeEach(async () => {
    assignments = createMock<ReviewAssignmentRepository>();
    assignments.create.mockResolvedValue(makeAssignment());
    assignments.findById.mockResolvedValue(makeAssignment());
    assignments.listForAssignee.mockResolvedValue([]);
    assignments.overdue.mockResolvedValue([]);
    assignments.complete.mockResolvedValue(true);

    projects = createMockProjectRepository();
    projects.findByName.mockResolvedValue(project);

    branches = createMock<BranchResolver>();
    branches.resolveRead.mockResolvedValue(defaultBranch);

    tests = createMock<UnifiedTestRepository>();
    tests.findByBranchAndTestName.mockResolvedValue({
      id: 'test-1',
      name: 'login',
      kind: 'image',
      createdAt,
    });

    runs = createMock<RunRepository>();
    runs.findByBranchKey.mockResolvedValue(makeRun());

    users = createMock<AuthRepository>();
    users.findUserByUsername.mockResolvedValue(makeUser());

    webhooks = createMock<WebhookDispatchService>();
    webhooks.enqueueReviewAssigned.mockResolvedValue(1);

    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);

    uow = createMockUoW();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewAssignmentService,
        { provide: ReviewAssignmentRepository, useValue: assignments },
        { provide: ProjectRepository, useValue: projects },
        { provide: BranchResolver, useValue: branches },
        { provide: UnifiedTestRepository, useValue: tests },
        { provide: RunRepository, useValue: runs },
        { provide: AuthRepository, useValue: users },
        { provide: WebhookDispatchService, useValue: webhooks },
        { provide: AuditService, useValue: audit },
        { provide: PrismaUnitOfWork, useValue: uow },
      ],
    }).compile();

    service = module.get(ReviewAssignmentService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('assigns a project test and returns its view', async () => {
      const result = await service.create(
        'shop',
        { testName: 'login', assignee: 'alice' },
        'admin',
      );

      expect(branches.resolveRead).toHaveBeenCalledWith('shop', undefined);
      expect(tests.findByBranchAndTestName).toHaveBeenCalledWith(
        'branch-1',
        'login',
      );
      expect(assignments.create).toHaveBeenCalledWith({
        projectId: 'project-1',
        branchName: 'main',
        testId: 'test-1',
        runId: null,
        assigneeId: 'user-1',
        assigneeUsername: 'alice',
        assignedBy: 'admin',
        dueAt: null,
      });
      expect(webhooks.enqueueReviewAssigned).toHaveBeenCalledWith({
        projectName: 'shop',
        testName: 'login',
        branchName: 'main',
        kind: 'image',
        assignee: 'alice',
        dueAt: null,
      });
      expect(audit.record).toHaveBeenCalledWith({
        actor: 'admin',
        action: AUDIT_ACTIONS.reviewAssign,
        projectName: 'shop',
        testName: 'login',
        branchName: 'main',
        targetType: 'assignment',
        targetId: 'assignment-1',
        metadata: { assignee: 'alice', dueAt: null, runKey: null },
      });
      expect(result).toEqual({
        id: 'assignment-1',
        projectName: 'shop',
        branchName: 'main',
        testName: 'login',
        testKind: 'image',
        runKey: null,
        assigneeUsername: 'alice',
        assignedBy: 'admin',
        dueAt: null,
        completedAt: null,
        createdAt,
        isOverdue: false,
      });
    });

    it('resolves the branch the caller named', async () => {
      branches.resolveRead.mockResolvedValue(featureBranch);
      assignments.create.mockResolvedValue(
        makeAssignment({ branchName: 'feature/x' }),
      );

      const result = await service.create(
        'shop',
        { testName: 'login', branch: 'feature/x', assignee: 'alice' },
        'admin',
      );

      expect(branches.resolveRead).toHaveBeenCalledWith('shop', 'feature/x');
      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ branchName: 'feature/x' }),
      );
      expect(result.branchName).toBe('feature/x');
    });

    it('assigns a run without naming its test, skipping the test lookup and the notification', async () => {
      assignments.create.mockResolvedValue(
        makeAssignment({
          testId: null,
          test: null,
          runId: 'run-1',
          run: { key: 'run-42' },
        }),
      );

      const result = await service.create(
        'shop',
        { runKey: 'run-42', assignee: 'alice' },
        'admin',
      );

      expect(runs.findByBranchKey).toHaveBeenCalledWith('branch-1', 'run-42');
      expect(tests.findByBranchAndTestName).not.toHaveBeenCalled();
      expect(assignments.create).toHaveBeenCalledWith({
        projectId: 'project-1',
        branchName: 'main',
        testId: null,
        runId: 'run-1',
        assigneeId: 'user-1',
        assigneeUsername: 'alice',
        assignedBy: 'admin',
        dueAt: null,
      });
      expect(webhooks.enqueueReviewAssigned).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          testName: null,
          metadata: { assignee: 'alice', dueAt: null, runKey: 'run-42' },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          testName: null,
          testKind: null,
          runKey: 'run-42',
        }),
      );
    });

    it('assigns a run together with the test it covers', async () => {
      assignments.create.mockResolvedValue(
        makeAssignment({ runId: 'run-1', run: { key: 'run-42' } }),
      );

      const result = await service.create(
        'shop',
        { runKey: 'run-42', testName: 'login', assignee: 'alice' },
        'admin',
      );

      expect(runs.findByBranchKey).toHaveBeenCalledWith('branch-1', 'run-42');
      expect(tests.findByBranchAndTestName).toHaveBeenCalledWith(
        'branch-1',
        'login',
      );
      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ testId: 'test-1', runId: 'run-1' }),
      );
      expect(webhooks.enqueueReviewAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ testName: 'login', kind: 'image' }),
      );
      expect(result).toEqual(
        expect.objectContaining({ testName: 'login', runKey: 'run-42' }),
      );
    });

    it('keeps the parsed due date in the row, the notification and the audit metadata', async () => {
      const dueAt = '2025-02-01T09:30:00.000Z';
      assignments.create.mockResolvedValue(
        makeAssignment({ dueAt: new Date(dueAt) }),
      );

      const result = await service.create(
        'shop',
        { testName: 'login', assignee: 'alice', dueAt },
        'admin',
      );

      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ dueAt: new Date(dueAt) }),
      );
      expect(webhooks.enqueueReviewAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ dueAt }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { assignee: 'alice', dueAt, runKey: null },
        }),
      );
      expect(result.dueAt).toEqual(new Date(dueAt));
    });

    it('rejects an assignee that does not exist', async () => {
      users.findUserByUsername.mockResolvedValue(null);

      await expect(
        service.create(
          'shop',
          { testName: 'login', assignee: 'ghost' },
          'admin',
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User "ghost" not found',
      });
      expect(branches.resolveRead).not.toHaveBeenCalled();
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive assignee', async () => {
      users.findUserByUsername.mockResolvedValue(
        makeUser({ isActive: false, deactivatedAt: createdAt }),
      );

      await expect(
        service.create(
          'shop',
          { testName: 'login', assignee: 'alice' },
          'admin',
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User "alice" not found',
      });
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects an assignment that names neither a test nor a run', async () => {
      await expect(
        service.create('shop', { assignee: 'alice' }, 'admin'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'A testName or runKey is required for an assignment',
      });
      expect(branches.resolveRead).not.toHaveBeenCalled();
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown project before looking up the assignee', async () => {
      projects.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          'shop',
          { testName: 'login', assignee: 'alice' },
          'admin',
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Project "shop" not found',
      });
      expect(users.findUserByUsername).not.toHaveBeenCalled();
    });

    it('rejects a run key that the branch does not have', async () => {
      runs.findByBranchKey.mockResolvedValue(null);

      await expect(
        service.create(
          'shop',
          { runKey: 'run-404', assignee: 'alice' },
          'admin',
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Run not found',
      });
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects a test that the named run does not cover', async () => {
      tests.findByBranchAndTestName.mockResolvedValue(null);

      await expect(
        service.create(
          'shop',
          { runKey: 'run-42', testName: 'missing', assignee: 'alice' },
          'admin',
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Test not found',
      });
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects a test that the branch does not have', async () => {
      tests.findByBranchAndTestName.mockResolvedValue(null);

      await expect(
        service.create(
          'shop',
          { testName: 'missing', assignee: 'alice' },
          'admin',
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Test not found',
      });
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects an unparseable due date before writing anything', async () => {
      await expect(
        service.create(
          'shop',
          { testName: 'login', assignee: 'alice', dueAt: 'not-a-date' },
          'admin',
        ),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'dueAt must be a valid date',
      });
      expect(uow.execute).not.toHaveBeenCalled();
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('writes the row, the notification and the audit trail in one transaction', async () => {
      let inChange = false;
      const observed: Record<string, boolean | undefined> = {};
      uow.execute.mockImplementation((async (fn: () => Promise<unknown>) => {
        inChange = true;
        try {
          return await fn();
        } finally {
          inChange = false;
        }
      }) as never);
      webhooks.enqueueReviewAssigned.mockImplementation(() => {
        observed.webhook = inChange;
        return Promise.resolve(1);
      });
      audit.record.mockImplementation(() => {
        observed.audit = inChange;
        return Promise.resolve();
      });

      await service.create(
        'shop',
        { testName: 'login', assignee: 'alice' },
        'admin',
      );

      expect(uow.execute).toHaveBeenCalledWith(expect.any(Function));
      expect(observed).toEqual({ webhook: true, audit: true });
      expect(assignments.create.mock.invocationCallOrder[0]).toBeLessThan(
        webhooks.enqueueReviewAssigned.mock.invocationCallOrder[0]!,
      );
      expect(
        webhooks.enqueueReviewAssigned.mock.invocationCallOrder[0],
      ).toBeLessThan(audit.record.mock.invocationCallOrder[0]!);
    });
  });

  describe('mine', () => {
    it('lists the open assignments of the assignee', async () => {
      assignments.listForAssignee.mockResolvedValue([makeAssignment()]);

      const result = await service.mine('user-1', false, ALL_PROJECTS);

      expect(assignments.listForAssignee).toHaveBeenCalledWith(
        'user-1',
        false,
        ALL_PROJECTS,
      );
      expect(result).toEqual([
        {
          id: 'assignment-1',
          projectName: 'shop',
          branchName: 'main',
          testName: 'login',
          testKind: 'image',
          runKey: null,
          assigneeUsername: 'alice',
          assignedBy: 'admin',
          dueAt: null,
          completedAt: null,
          createdAt,
          isOverdue: false,
        },
      ]);
    });

    it('includes completed assignments when the caller asks for them', async () => {
      await service.mine('user-1', true, ALL_PROJECTS);

      expect(assignments.listForAssignee).toHaveBeenCalledWith(
        'user-1',
        true,
        ALL_PROJECTS,
      );
    });

    it('derives isOverdue from an open assignment with a past due date', async () => {
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 60_000);
      assignments.listForAssignee.mockResolvedValue([
        makeAssignment({ id: 'open-overdue', dueAt: past }),
        makeAssignment({
          id: 'done-past-due',
          dueAt: past,
          completedAt: new Date(),
        }),
        makeAssignment({ id: 'open-no-due-date', dueAt: null }),
        makeAssignment({
          id: 'open-due-later',
          dueAt: future,
          testId: null,
          test: null,
          runId: 'run-1',
          run: { key: 'run-42' },
        }),
      ]);

      const result = await service.mine('user-1', false, ALL_PROJECTS);

      expect(
        result.map((row) => [row.id, row.isOverdue, row.testName, row.runKey]),
      ).toEqual([
        ['open-overdue', true, 'login', null],
        ['done-past-due', false, 'login', null],
        ['open-no-due-date', false, 'login', null],
        ['open-due-later', false, null, 'run-42'],
      ]);
      expect(result.map((row) => row.testKind)).toEqual([
        'image',
        'image',
        'image',
        null,
      ]);
    });
  });

  describe('overdue', () => {
    it('lists the overdue assignments as of now', async () => {
      const dueAt = new Date(Date.now() - 60_000);
      assignments.overdue.mockResolvedValue([
        makeAssignment({ dueAt, run: { key: 'run-42' } }),
      ]);

      const result = await service.overdue('user-1', ALL_PROJECTS);

      expect(assignments.overdue).toHaveBeenCalledWith(
        'user-1',
        expect.any(Date),
        ALL_PROJECTS,
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 'assignment-1',
          dueAt,
          runKey: 'run-42',
          isOverdue: true,
        }),
      ]);
    });
  });

  describe('complete', () => {
    it('completes an open assignment and records the trail', async () => {
      const completedAt = new Date();
      assignments.findById.mockResolvedValue(makeAssignment({ completedAt }));

      const result = await service.complete('user-1', 'assignment-1', 'alice');

      expect(assignments.complete).toHaveBeenCalledWith(
        'assignment-1',
        'user-1',
      );
      expect(assignments.findById).toHaveBeenCalledWith('assignment-1');
      expect(audit.record).toHaveBeenCalledWith({
        actor: 'alice',
        action: AUDIT_ACTIONS.reviewComplete,
        projectName: 'shop',
        testName: 'login',
        branchName: 'main',
        targetType: 'assignment',
        targetId: 'assignment-1',
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'assignment-1',
          completedAt,
          isOverdue: false,
        }),
      );
    });

    it('records a run-only assignment with a null test name', async () => {
      assignments.findById.mockResolvedValue(
        makeAssignment({
          testId: null,
          test: null,
          runId: 'run-1',
          run: { key: 'run-42' },
          completedAt: new Date(),
        }),
      );

      const result = await service.complete('user-1', 'assignment-1', 'alice');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ testName: null, targetId: 'assignment-1' }),
      );
      expect(result).toEqual(
        expect.objectContaining({ testName: null, runKey: 'run-42' }),
      );
    });

    it('rejects an assignment that is already complete or belongs to someone else', async () => {
      assignments.complete.mockResolvedValue(false);

      await expect(
        service.complete('user-1', 'assignment-1', 'alice'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Assignment not found or already complete',
      });
      expect(assignments.findById).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects when the completed row cannot be read back', async () => {
      assignments.findById.mockResolvedValue(null);

      await expect(
        service.complete('user-1', 'assignment-1', 'alice'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('runs the completion and its audit row in one transaction', async () => {
      let inChange = false;
      let auditWrittenInChange: boolean | undefined;
      uow.execute.mockImplementation((async (fn: () => Promise<unknown>) => {
        inChange = true;
        try {
          return await fn();
        } finally {
          inChange = false;
        }
      }) as never);
      audit.record.mockImplementation(() => {
        auditWrittenInChange = inChange;
        return Promise.resolve();
      });

      await service.complete('user-1', 'assignment-1', 'alice');

      expect(assignments.complete.mock.invocationCallOrder[0]).toBeLessThan(
        audit.record.mock.invocationCallOrder[0]!,
      );
      expect(auditWrittenInChange).toBe(true);
    });
  });

  it('propagates a failed branch resolution as a domain error', async () => {
    branches.resolveRead.mockRejectedValue(
      new DomainError('Branch "nope" not found in project "shop"', 'NOT_FOUND'),
    );

    await expect(
      service.create(
        'shop',
        { testName: 'login', branch: 'nope', assignee: 'alice' },
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(assignments.create).not.toHaveBeenCalled();
  });
});
