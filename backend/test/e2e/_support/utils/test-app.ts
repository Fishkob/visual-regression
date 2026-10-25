import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createValidationPipe } from '@common/http/validation-pipe';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppModule } from '@app';
import { IntakeWorkerModule } from '@public/visualTest/intake/intake-worker.module';
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
      imports: [AppModule, IntakeWorkerModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(createValidationPipe());

    await app.init();

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

    // The approval audit rows and the review artifacts deliberately have no
    // foreign key to the test, so the cascading deletes below cannot reach
    // them: clear them explicitly.
    await db.approval.deleteMany();
    await db.approvalVote.deleteMany();
    await db.reviewComment.deleteMany();
    await db.unifiedVariant.deleteMany();
    await db.unifiedComparison.deleteMany();
    await db.unifiedScreenshot.deleteMany();
    await db.unifiedTest.deleteMany();
    await db.comparisonJob.deleteMany();
    await db.branch.deleteMany();
    await db.project.deleteMany();
    await db.projectGroup.deleteMany();
    await db.rateLimitBucket.deleteMany();
    await db.session.deleteMany();
    await db.apiKey.deleteMany();
    await db.user.deleteMany();

    await this.seedApiKey();
  }

  /**
   * Creates a project with its main branch linked as default. Every project has
   * a default branch (the service enforces it), so e2e fixtures must not create
   * a bare project row.
   */
  static async createProject(
    name: string,
  ): Promise<{ projectId: string; branchId: string }> {
    const app = this.appInstance;
    if (!app) throw new Error('App instance not initialized');
    const db = app.get(PrismaConnection).client;
    const project = await db.project.create({ data: { name } });
    const branch = await db.branch.create({
      data: { projectId: project.id, name: 'main' },
    });
    await db.project.update({
      where: { id: project.id },
      data: { defaultBranchId: branch.id },
    });
    return { projectId: project.id, branchId: branch.id };
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
        projectNames: [],
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
