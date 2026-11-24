import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createValidationPipe } from '@common/http/validation-pipe';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppModule } from '@app';
import { IntakeWorkerModule } from '@public/visualTest/intake/intake-worker.module';
import { ComparisonJobPoller } from '@public/visualTest/intake/workers/comparison-job-poller';
import { DataDeletionModule } from '@internal/data-deletion/data-deletion.module';
import { hashToken } from '@internal/auth/token-hash';
import { E2E_API_KEY } from './e2e-api-key';

/**
 * Utility for initializing and cleaning up a test instance of the NestJS app.
 * Used in E2E and integration tests.
 */
export class TestApp {
  private static appInstance: INestApplication | null = null;

  /**
   * Initialize a new NestJS test application with global pipes & modules.
   */
  static async init(): Promise<INestApplication> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      // The worker-only modules ride along so a test can drive a sweep or a
      // queued job in-process; production keeps them in WorkerModule.
      imports: [AppModule, IntakeWorkerModule, DataDeletionModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(createValidationPipe());

    await app.init();

    // The harness drives queued jobs itself (waitForComparison/drainJobs), so the
    // poller must not claim them. A live poller and the harness can pick up the
    // same job within one cycle: two comparisons run for one candidate, both see
    // no pending row, and the loser is rejected by the database's single-pending
    // trigger as an unrelated P2002 — a flake that has nothing to do with the
    // behaviour under test.
    app.get(ComparisonJobPoller).stop();

    this.appInstance = app;

    await this.seedApiKey();

    return app;
  }

  /**
   * Resets all Prisma tables — use between E2E tests for isolation.
   */
  static async resetDb(): Promise<void> {
    const app = this.appInstance;
    if (!app) throw new Error('App instance not initialized');

    const db = app.get(PrismaConnection).client;

    // The approval audit rows and the outcome trail deliberately have no foreign
    // key to the test, so the cascading deletes below cannot reach them: clear
    // them explicitly. Comments are cleared here as well, even though
    // `ReviewComment.testId` now cascades — the reset should not depend on a
    // constraint to be complete. The same is true for the global trail and share
    // links, whose rows outlive the project they name — leaving them behind made
    // list assertions depend on earlier test files.
    await db.approval.deleteMany();
    await db.reviewComment.deleteMany();
    await db.shareLink.deleteMany();
    await db.auditEvent.deleteMany();
    await db.comparisonOutcomeEvent.deleteMany();
    // Comparisons first: a variant delete cascades into its screenshots, and a
    // comparison still pointing at one of them is a RESTRICT violation. The
    // application retires comparisons before removing screenshots for the same
    // reason; the reset has to use that order too.
    await db.unifiedComparison.deleteMany();
    await db.unifiedVariant.deleteMany();
    await db.unifiedScreenshot.deleteMany();
    await db.unifiedTest.deleteMany();
    await db.comparisonJob.deleteMany();
    await db.branch.deleteMany();
    await db.project.deleteMany();
    await db.projectGroup.deleteMany();
    // Teams go after the projects that reference them (`Project.teamId` is
    // RESTRICT, ADR-082). Membership cascades from the team, but the reset
    // clears it explicitly instead of leaning on the constraint.
    await db.teamMember.deleteMany();
    await db.team.deleteMany();
    await db.rateLimitBucket.deleteMany();
    await db.session.deleteMany();
    await db.apiKey.deleteMany();
    await db.user.deleteMany();

    await this.seedApiKey();
  }

  /**
   * Creates a project with its main branch linked as default. Every project has
   * a default branch (the service enforces it) and an owning team (ADR-083), so
   * e2e fixtures must not create a bare project row: a fixture that wants a
   * different owner passes the team id, and one that wants a *shared* project
   * passes `isShared`.
   */
  static async createProject(
    name: string,
    options: { teamId?: string; isShared?: boolean } = {},
  ): Promise<{ projectId: string; branchId: string; teamId: string }> {
    const app = this.appInstance;
    if (!app) throw new Error('App instance not initialized');
    const db = app.get(PrismaConnection).client;
    const teamId = options.teamId ?? (await this.ensureTeam('fixture-team')).id;
    const project = await db.project.create({
      data: { name, teamId, isShared: options.isShared ?? false },
    });
    const branch = await db.branch.create({
      data: { projectId: project.id, name: 'main' },
    });
    await db.project.update({
      where: { id: project.id },
      data: { defaultBranchId: branch.id },
    });
    return { projectId: project.id, branchId: branch.id, teamId };
  }

  /**
   * A team row for a fixture that needs an owner but does not care which. Not a
   * back door around the access rule: a fixture that asserts *visibility* builds
   * its own teams and members through `createTeam`.
   */
  static async ensureTeam(name: string): Promise<{ id: string; name: string }> {
    const app = this.appInstance;
    if (!app) throw new Error('App instance not initialized');
    const db = app.get(PrismaConnection).client;
    return db.team.upsert({
      where: { name },
      create: { name, createdBy: 'fixture' },
      update: {},
      select: { id: true, name: true },
    });
  }

  /**
   * Seeds the fixed e2e api key (idempotent) so authenticated product requests
   * pass the global AuthenticationGuard. Re-seeded after resetDb() clears it.
   */
  static async seedApiKey(): Promise<void> {
    const app = this.appInstance;
    if (!app) throw new Error('App instance not initialized');
    const db = app.get(PrismaConnection).client;
    const keyHash = hashToken(E2E_API_KEY);
    await db.apiKey.upsert({
      where: { keyHash },
      create: {
        name: 'e2e',
        keyHash,
        scopes: ['upload', 'read', 'approve', 'admin'],
        projectIds: [],
      },
      update: {},
    });
  }

  /**
   * Returns the underlying HTTP server for supertest.
   */
  static getHttpServer(): ReturnType<INestApplication['getHttpServer']> {
    const app = this.appInstance;
    if (!app)
      throw new Error('TestApp not initialized. Call TestApp.init() first.');

    return app.getHttpServer();
  }

  /**
   * Gracefully close the NestJS app.
   */
  static async close(): Promise<void> {
    const app = this.appInstance;
    if (app) {
      await app.close();
      this.appInstance = null;
    }
  }
}
